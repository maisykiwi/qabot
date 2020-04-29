const lib = require("./usetrace_lib");
const xml2js = require("xml2js");
const xmlParser = new xml2js.Parser();
const api = require("./urls");
const axios = require("axios");
const config = require("./config");
const pt_lib = require("./pivotal_tracker_lib");

const checkTestStatus = (bot, db) => {
    const statement = `select * from usetrace_jobs uj where uj.finished = '0'`;

    db.query(statement, function (e, result) {
        if (result && result.length > 0) {
            for (item of result) {
                console.log("==== checkTestStatus Item: ", item);
                lib
                    .checkResultStatus(item.batch_id)
                    .then(function (resp) {
                        if (resp) {
                            // get test result and update table
                            const mark_done_statement = `update usetrace_jobs uj set uj.finished = '1' where uj.batch_id="${item.batch_id}"`;
                            lib
                                .getResultByProjectId(item.project_id)
                                .then(function (inner_response) {
                                    const batch = inner_response.data.batch;
                                    const report = [];
                                    report.push("Name: " + item.project_name);
                                    report.push("Id: " + batch.id);
                                    report.push("Requested: " + batch.requested);
                                    report.push("Finished: " + batch.finished);
                                    report.push("Passed: " + batch.passed);
                                    report.push("Failed: " + batch.failed);

                                    if (batch.failed > 0) {
                                        lib
                                            .getFailedBrowserSessions(
                                                batch.id,
                                                item.project_id,
                                                batch.failed,
                                                item.project_name
                                            )
                                            .then(function (resp2) {
                                                report.push(resp2);
                                                // send failure report
                                                db.query(mark_done_statement, function (err, inner_result) {
                                                    console.log("==== mark done statement result: ", inner_result);
                                                    if (!err) {
                                                        const params = {
                                                            thread_ts: item.reply_thread,
                                                            icon_emoji: ":usetrace:"
                                                        };
                                                        bot.postMessage(
                                                            item.channel,
                                                            report.join("\n"),
                                                            params
                                                        );
                                                    } else {
                                                        console.error("Error: ", err);
                                                    }
                                                });
                                            })
                                            .catch(function (err) {
                                                console.error("Error: ", err);
                                            });
                                    } else {
                                        // no failure, just return result
                                        db.query(mark_done_statement, function (err, result) {
                                            if (!err) {
                                                const params = {
                                                    thread_ts: item.reply_thread,
                                                    icon_emoji: ":usetrace:"
                                                };
                                                bot.postMessage(
                                                    item.channel,
                                                    report.join("\n"),
                                                    params
                                                );
                                            } else {
                                                console.error("Error: ", err);
                                            }
                                        });
                                    }
                                })
                                .catch(function (err) {
                                    console.error("Error checking status: ", err);
                                });
                        }
                    })
                    .catch(function (err) {
                        console.error("err: ", err);
                    });
            }
        }
    });
};

const handleSingleTrace = batchId => {
    return new Promise(function (resolve, reject) {
        lib
            .checkResultStatus(batchId)
            .then(function (resp) {
                if (resp) {
                    const markDone = `update usetrace_rerun ur set ur.finished = '1' where ur.new_batch_id="${batchId}";`;
                    db.query(markDone, function (err, result) {
                        console.log("mark done result: ", result);
                        if (err) {
                            console.log("Error: ", err);
                            reject("Error in mark done: ", err);
                        } else {
                            resolve("done");
                        }
                    });
                } else {
                    resolve("done");
                }
            })
            .catch(function (e) {
                console.log("Error in checking result status: ", e);
                reject(e);
            });
    });
};

const checkEachUnfinishedTraceStatus = db => {
    return new Promise(function (resolve, reject) {
        const check_each_trace = `select * from usetrace_rerun ur where ur.started = 1 and finished = 0;`;
        const promiseArr = [];
        db.query(check_each_trace, function (e, result) {
            if (e) {
                console.log("Error: ", e);
            } else if (result && result.length > 0) {
                for (let item of result) {
                    console.log("==== work on unfinished one: ", item.new_batch_id)
                    promiseArr.push(handleSingleTrace(item.new_batch_id));
                }
            }
        });
        Promise.all(promiseArr)
            .then(() => {
                console.log("=== All promise resolved incheckEachUnfinishedTraceStatus")
                resolve("done");
            })
            .catch(e => reject(e));
    });
};

const getFinishedResultCount = projectName => {
    return new Promise(function (resolve, reject) {
        const statement = `select id, count(*) as cnt from usetrace_rerun ur where ur.started = 1 and ur.finished = 1 and ur.project_name="${projectName}" group by ur.project_name;`;
        db.query(statement, function (e, result) {
            if (e) {
                reject(e);
            } else {
                console.log("===>> getFinishedResultCount result: ", result);
                if (result && result.length > 0) {
                    resolve(result[0].cnt);
                } else {
                    resolve(result.cnt);
                }
            }
        });
    });
};

const getSingleTraceReport = (batchId, trace_name) => {
    return new Promise(function (resolve, reject) {
        const url = api.checkResultReady(batchId);
        axios
            .get(url)
            .then(function (response) {
                if (
                    response &&
                    response.data &&
                    typeof response.data === "object" &&
                    response.data.statusCode === 404
                ) {
                    reject("result not ready");
                } else {
                    lib
                        .getSingleBrowserSesssionByBatchId(batchId)
                        .then(function (resp) {
                            resolve(resp);
                        }).catch(function (err) {
                            reject("cannot get single browser session by batch id: ", err);
                        });
                }
            })
            .catch(function (error) {
                reject("result not ready: ", error);
            });
    });
};

const getRerunReport = projectName => {
    return new Promise(function (resolve, reject) {
        const statement = `select * from usetrace_rerun ur where ur.started = 1 and ur.finished = 1 and ur.project_name="${projectName}"`;
        const promiseArr = [];
        db.query(statement, function (e, result) {
            if (result && result.length > 0) {
                // use batch id to get reports
                for (let item of result) {
                    promiseArr.push(getSingleTraceReport(item.new_batch_id, item.trace_name));
                }

                Promise.all(promiseArr)
                    .then(reportResults => {
                        console.log("=== reportResults: ", reportResults);
                        const titleReport = [];
                        const errorReport = [];
                        titleReport.push(`Reran ${reportResults.length} trace${reportResults.length > 1 ? "s" : ""}`);

                        for (let [index, item] of reportResults.entries()) {
                            if (!item || !item.title) {
                                continue;
                            }
                            const title = item.title;

                            titleReport.push(`${index + 1}) ${title} - ${item.hasError ? "[Failed]" : "[Passed]"}`);

                            if (item.hasError) {
                                errorReport.push(`== ${title} ==`);
                                errorReport.push(`Error: ${item.error}`);
                            }

                            if (item.errorScreenshot) {
                                errorReport.push(`Screenshot: ${item.errorScreenshot}`);
                            }
                        }

                        if (errorReport.length > 0) {
                            titleReport.push("\n");
                            titleReport.push("Failure Details");
                        }

                        titleReport.push(errorReport.join("\n"));
                        resolve(titleReport.join("\n"));
                    })
                    .catch(e => reject(e));
            } else {
                resolve("no result")
            }
        });
    });
};

const resetFinishForSentReport = projectName => {
    return new Promise(function (resolve, reject) {
        const statement = `UPDATE usetrace_rerun ur set ur.started = 0 and ur.finished = 0 WHERE ur.project_name="${projectName}"`;
        db.query(statement, function (e, result) {
            console.log("===>> reset result: ", result);
            if (e) {
                reject(e);
            } else {
                resolve("done");
            }
        });
    });
}

const checkRerunStatus = async (bot, db) => {
    try {
        await checkEachUnfinishedTraceStatus(db);
    } catch (e) {
        console.log("Error: ", e);
    }
    // check if any report ready
    const check_finished_statement = `select project_name, id, count(*) as cnt, channel, reply_thread from usetrace_rerun ur where ur.started = 1 group by ur.project_name;`;
    db.query(check_finished_statement, async function (e, result) {
        try {
            if (result && result.length > 0) {
                for (let item of result) {
                    // check if finished cnt is equal to item.cnt
                    const finishedCnt = await getFinishedResultCount(item.project_name);
                    console.log("===== Name: ", item.project_name);
                    console.log("==== finishedCnt: ", finishedCnt);
                    console.log("==== item.cnt: ", item.cnt);
                    if (finishedCnt === item.cnt) {
                        const finalReport = await getRerunReport(item.project_name);
                        const params = {
                            thread_ts: item.reply_thread,
                            icon_emoji: ":usetrace:"
                        };
                        await resetFinishForSentReport(item.project_name);
                        bot.postMessage(item.channel, finalReport, params);
                    }
                }
            }
        } catch (e) {
            console.log("Error: ", e);
        }
    });
};

const pingToAlive = async (bot) => {
    var params = {
        icon_emoji: ':success:'
    };
    bot.postMessage(config.PING_CHANNEL, "I am alive!", params);
}

const compileAndSendPivotalTrackerReport = async (ptbot) => {
    pt_lib.getAllDeliveredStories(ptbot, config.PTBOT_REPORT_CHANNEL, "");
}

exports.checkTestStatus = checkTestStatus;
exports.checkRerunStatus = checkRerunStatus;
exports.pingToAlive = pingToAlive;
exports.compileAndSendPivotalTrackerReport = compileAndSendPivotalTrackerReport;