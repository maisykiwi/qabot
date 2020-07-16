const config = require("./config");
const SlackBot = require("slackbots");
const lib = require("./usetrace_lib");
const jobs = require("./cron-job");
const cron = require("node-cron");
const query = require("./database");
const api = require("./urls");
const axios = require("axios");


let channelMap = null;
let userMap = null;

const reportUsage = (bot, data) => {
    if (!data) {
        return;
    }

    let channelName = "";
    let userName = "";
    if (channelMap) {
        channelObj = channelMap.filter(item => item.id === data.channel);
        channelName = channelObj && channelObj[0] ? channelObj[0].name : "unknown";
    }

    if (userMap) {
        userObj = userMap.filter(item => item.id === data.user);
        userName = userObj && userObj[0] ? userObj[0].name : "unknown";
    }

    var params = {
        icon_emoji: ":cherry_blossom:"
    };

    bot.postMessage(
        config.MMBOT_TEST_PING_CHANNEL,
        `Message: ${data.text}, Channel: ${channelName}, User: ${userName}`,
        params
    );
};

const runProject = async (bot, name, channel, reply_ts) => {
    const params = {
        thread_ts: reply_ts,
        icon_emoji: ":robot_face:"
    };

    try {
        const map = await lib.getProjectMap();
        if (map.has(name)) {
            const project_id = map.get(name);

            let finalTags = [];
            const tagMap = await lib.getTagsMap();
            const projectMap = await lib.getProjectMap();
            if (projectMap.has(name)) {
                if (tagMap.has(project_id)) {
                    const defaultTags = Array.from(tagMap.get(project_id));
                    finalTags = defaultTags.filter(item => item !== "routine");
                }
            }

            const resp = await lib.runProjectById(project_id, finalTags);
            await query.insertJob(resp, project_id, name, channel, reply_ts);

            bot.postMessage(
                channel,
                `Started: ${name} \nbatch id: ${resp}`,
                params
            );
            await lib.deleteAllRerunRecordByProject(name);
            return;
        } else {
            bot.postMessage(
                channel,
                "Invalid project name: " +
                name +
                ", use `@mmbot projects` to get all available projects",
                params
            );
            return;
        }
    } catch (e) {
        console.log("Error: ", e);
        bot.postMessage(channel, `Error: ${e}`, params);
    }
}

function invalidAction(bot, channel, reply_ts) {
    const params = {
        thread_ts: reply_ts,
        icon_emoji: ":robot_face:"
    };
    bot.postMessage(channel, "invalid action", params);
}

const rerunFailure = async (name, channel, reply_ts, bot) => {
    const params = {
        thread_ts: reply_ts,
        icon_emoji: ":robot_face:"
    };
    if (!name) {
        bot.postMessage(
            channel,
            "Please give me a project name, use `@mmbot projects` to get all available projects",
            params
        );
        return;
    }

    if (!config.MASTERMIND_PROJECTS.includes(name)) {
        bot.postMessage(
            channel,
            "Invalid project anme, use `@mmbot projects` to get all available projects",
            params
        );
        return;
    }

    try {
        // check if rerun database has project name
        let check = await lib.checkRerunHasProjectName(name);
        if (check) {
            // project name exist
            // insert channel and reply thread
            const resp = await lib.rerunFailedTraces(name, channel, reply_ts);
            bot.postMessage(
                channel,
                `Reruning ${resp.length} failure trace${
                resp.length > 1 ? "s" : ""
                }: \n ${resp.join("\n")}`,
                params
            );
        } else {
            bot.postMessage(
                channel,
                "No failure record for project " +
                name +
                ", use `@mmbot run " +
                name +
                "` to run all traces again",
                params
            );
        }
    } catch (e) {
        console.log("Error: ", e);
    }
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

const startMMbot = (db) => {
    // mmbot
    let mmbot = new SlackBot({
        token: config.MMBOT_TOKEN,
        name: config.MMBOT_NAME
    });

    mmbot.on("start", () => {
        console.log("mmbot started")
        mmbot
            .getChannels()
            .then(data => (channelMap = data.channels))
            .catch(e => console.log("Error getting channel map: ", e));

        mmbot
            .getUsers()
            .then(data => (userMap = data.members))
            .catch(e => console.log("Error getting users map: ", e));
    })

    mmbot.on("error", err => console.log("mmbot Error: ", err));

    mmbot.on("message", data => {
        if (data.type === "goodbye" && data.source === "gateway_server") {
            console.log("==gateway closing, trying to reconnect");
            mmbot = new SlackBot({
                token: config.MMBOT_TOKEN,
                name: config.MMBOT_NAME
            });
            mmbot.connect();
        }

        if (data.type !== "message") {
            return;
        }

        if (data.subtype && data.subtype === "message_replied") {
            return;
        }

        if (data.username && data.username === "mmbot") {
            return;
        }

        if (!data.text) {
            return;
        }

        if (!data.text.startsWith(config.MMBOT_CODE)) {
            return;
        }

        // report usage
        reportUsage(mmbot, data);

        let cleaned = data.text.split(" ");
        if (cleaned.length < 2) {
            return;
        }

        cleaned = cleaned.slice(1);

        let action = cleaned[0];
        let reply_ts = data.ts;

        if (data.thread_ts) {
            reply_ts = data.thread_ts;
        }
        const params = {
            thread_ts: reply_ts,
            icon_emoji: ":robot_face:"
        };

        switch (action.toLowerCase()) {
            case "run":
                let name = cleaned.slice(1);
                name = name.join(" ").trim().toLowerCase();
                if (config.MASTERMIND_PROJECTS.includes(name)) {
                    runProject(mmbot, name, data.channel, reply_ts);
                } else {
                    mmbot.postMessage(
                        data.channel,
                        "Please give me a project name, use `@mmbot projects` to get all available projects",
                        params
                    );
                }
                break;
            case "rerun":
                let rerun_name = cleaned.slice(1);
                rerun_name = rerun_name.join(" ").trim().toLowerCase();
                rerunFailure(rerun_name, data.channel, reply_ts, mmbot);
                break;
            case "project":
            case "projects":
                //return all projects
                const projects = config.MASTERMIND_PROJECTS;
                if (projects && projects.length > 0) {
                    const names = projects.join("\n")
                    mmbot.postMessage(data.channel, names, params)
                }
                break;
            default:
                invalidAction(mmbot, data.channel, reply_ts);
                break;
        }
    })

    cron.schedule("45 * * * * *", function () {
        checkMMbotTestStatus(mmbot, db);
    });

    cron.schedule("35 * * * * *", function () {
        checkMMbotRerunStatus(mmbot, db);
    });
}

const checkEachUnfinishedTraceStatus = db => {
    return new Promise(function (resolve, reject) {
        const check_each_trace = `select * from usetrace_rerun ur where ur.started = 1 and finished = 0 and ur.project_name LIKE 'mastermind%';`;
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


const checkMMbotRerunStatus = async (bot, db) => {
    try {
        await checkEachUnfinishedTraceStatus(db);
    } catch (e) {
        console.log("Error: ", e);
    }
    // check if any report ready
    const check_finished_statement = `select project_name, id, count(*) as cnt, channel, reply_thread from usetrace_rerun ur where ur.started = 1 and ur.project_name LIKE 'mastermind%' group by ur.project_name;`;
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
                            icon_emoji: ":robot_face:"
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


const checkMMbotTestStatus = (bot, db) => {
    const statement = `select * from usetrace_jobs uj where uj.finished = '0' and uj.project_name LIKE 'mastermind%'`;

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
                                                            icon_emoji: ":robot_face:"
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
                                                    icon_emoji: ":robot_face:"
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
}

exports.startMMbot = startMMbot;