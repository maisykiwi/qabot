const api = require("./urls");
const axios = require("axios");
const config = require("./config");
const query = require("./database");

const getProjectMap = () => {
    return new Promise(function (resolve, reject) {
        const url = api.inits();
        axios
            .get(url, {
                headers: {
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Accept-Language": "en-US,en;q=0.9",
                    "User-Agent": config.USER_AGENT,
                    Accept: "application/json, text/javascript, */*; q=0.01",
                    Referer: "https://team.usetrace.com/",
                    "X-Requested-With": "XMLHttpRequest",
                    Connection: "keep-alive",
                    Cookie: config.COOKIES
                }
            })
            .then(function (response) {
                if (response && response.data && response.data.projects) {
                    const projects = response.data.projects;
                    const map = new Map();
                    for (let item of projects) {
                        map.set(item.name, item.id);
                    }
                    resolve(map);
                }
            })
            .catch(function (error) {
                console.error("Error in getProjectNames: ", error);
                reject(error);
            });
    });
};

const getTagsMap = () => {
    return new Promise(function (resolve, reject) {
        const url = api.inits();
        axios
            .get(url, {
                headers: {
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Accept-Language": "en-US,en;q=0.9",
                    "User-Agent": config.USER_AGENT,
                    Accept: "application/json, text/javascript, */*; q=0.01",
                    Referer: "https://team.usetrace.com/",
                    "X-Requested-With": "XMLHttpRequest",
                    Connection: "keep-alive",
                    Cookie: config.COOKIES
                }
            })
            .then(function (response) {
                if (response && response.data && response.data.scripts) {
                    const traces = response.data.scripts;
                    const map = new Map();
                    for (let item of traces) {
                        if (map.has(item.projectId)) {
                            const existingTags = Array.from(map.get(item.projectId));
                            const newTags = new Set([...item.tags, ...existingTags]);
                            map.set(item.projectId, newTags);
                        } else {
                            const tags = new Set([...item.tags])
                            map.set(item.projectId, tags);
                        }
                    }
                    resolve(map);
                }
            })
            .catch(function (error) {
                console.error("Error in getTagsMap: ", error);
                reject(error);
            });
    });
}

const getProjectNames = async () => {
    try {
        const nameMap = await getProjectMap();
        const keys = Array.from(nameMap.keys());
        return keys.join("\n");
    } catch (e) {
        console.log("Error: ", e);
        return "";
    }
};

const runProjectById = async (id, tags = []) => {
    const url = api.postProject(id);
    const headers = {
        "Content-type": "application/json"
    };
    const payload = {
        requiredCapabilities: [{
            browserName: "chrome"
        }]
    };

    if (tags && tags.length > 0) {
        payload.tags = tags;
    }

    const options = {
        method: "POST",
        headers,
        data: JSON.stringify(payload),
        url
    };

    return new Promise(function (resolve, reject) {
        axios(options)
            .then(function (response) {
                resolve(response.data);
            })
            .catch(function (error) {
                console.error("error in run project: ", error);
                reject(error);
            });
    });
};

const checkResultStatus = async batch_id => {
    return new Promise(function (resolve, reject) {
        try {
            const url = api.checkResultReady(batch_id);
            axios
                .get(url)
                .then(function (response) {
                    if (
                        response &&
                        response.data &&
                        typeof response.data === "object" &&
                        response.data.statusCode === 404
                    ) {
                        resolve(false);
                    }
                    resolve(true);
                })
                .catch(function (error) {
                    console.error("Error in getProjectNames: ", error);
                    reject(false);
                });
        } catch (e) {
            console.log("Error catch in check:", e);
            reject(false);
        }
    });
};

const getResultByProjectId = async project_id => {
    return new Promise(function (resolve, reject) {
        const url = ` https://api.usetrace.com/api/project/${project_id}/lastBatchStatus`;
        axios
            .get(url)
            .then(function (response) {
                resolve(response);
            })
            .catch(function (error) {
                console.error("Error in getResultByProjectId: ", error);
                reject(error);
            });
    });
};

const recordError = (item, projectName) => {
    return new Promise(function (resolve, reject) {
        // clean up before insert
        //const clean_up_statement = `DELETE from usetrace_rerun where project_name = "${projectName}"`;

        // insert into rerun table
        const insert_rerun_statement = `INSERT into usetrace_rerun(project_name, project_id, trace_name, trace_id ) values ("${projectName}", "${item.projectId}", "${item.traceName}", "${item.scriptId}");`;

        //db.query(clean_up_statement, function (e, res) {
        //    if (e) {
        //        reject("Error: ", e);
        //    } else {
        db.query(insert_rerun_statement, function (err, result) {
            if (err) {
                reject("Error: ", err);
            }
            resolve("done");
        });
        //    }
        //})
    });
};

const deleteRerunRecordById = (id) => {
    return new Promise(function (resolve, reject) {
        const statement = `DELETE FROM usetrace_rerun WHERE id = ${id}`;
        db.query(statement, function (err, result) {
            if (err) {
                reject("Error: ", err);
            } else {
                resolve("done");
            }
        })
    });
}

const deleteAllRerunRecordByProject = (projectName) => {
    return new Promise(function (resolve, reject) {

        const statement = `SELECT * FROM usetrace_rerun ur WHERE ur.project_name = "${projectName}"`;

        db.query(statement, function (err, result) {
            if (result && result.length > 0) {
                const promiseArr = []
                for (let item of result) {
                    promiseArr.push(deleteRerunRecordById(item.id));
                }

                Promise.all(promiseArr).then(() => resolve("done")).catch((e) => reject(e));
            } else {
                resolve("done");
            }
        })
    })
}

const getFailedBrowserSessions = (
    batchId,
    projectId,
    failedCnt,
    projectName
) => {
    return new Promise(function (resolve, reject) {
        const url = api.inits();
        axios
            .get(url, {
                headers: {
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Accept-Language": "en-US,en;q=0.9",
                    "User-Agent": config.USER_AGENT,
                    Accept: "application/json, text/javascript, */*; q=0.01",
                    Referer: "https://team.usetrace.com/",
                    "X-Requested-With": "XMLHttpRequest",
                    Connection: "keep-alive",
                    Cookie: config.COOKIES
                }
            })
            .then(function (response) {
                if (response && response.data && response.data.browserSessions) {
                    const browserSessions = response.data.browserSessions;
                    const errReport = [];
                    const promiseArr = [];
                    let cnt = 0;
                    for (let item of browserSessions) {
                        if (
                            item.batchId === batchId &&
                            item.hasError &&
                            item.scriptId &&
                            item.projectId === projectId
                        ) {
                            if (item.error) {
                                const errorObject = item.error;

                                if (errorObject.data) {
                                    const dataObj = errorObject.data;
                                    if (dataObj.message) {
                                        cnt++;
                                        errReport.push("== Failure #" + cnt.toString() + " ==");
                                        errReport.push(item.traceName);
                                        errReport.push("Error Message: ");
                                        errReport.push(dataObj.message);

                                        if (item.hasErrorScreenshot && item.errorScreenshot) {
                                            const errorScreenshotObj = item.errorScreenshot;
                                            if (errorScreenshotObj.full) {
                                                const fullObj = errorScreenshotObj.full;
                                                if (fullObj.url) {
                                                    errReport.push("Error Screenshot:");
                                                    errReport.push(fullObj.url);
                                                }
                                            }
                                        }
                                    }
                                }
                                promiseArr.push(recordError(item, projectName));
                            }
                        }
                    }

                    Promise.all(promiseArr)
                        .then(() => {
                            if (failedCnt !== cnt) {
                                errReport.push(
                                    "== Failed counts not match in report, additional investigation needed"
                                );
                            }
                            resolve(errReport.join("\n"));
                        })
                        .catch(errArr => reject("Error: ", errArr));
                } else {
                    resolve("Cannot find failure details");
                }
            })
            .catch(function (error) {
                console.error("Error in getProjectNames: ", error);
                reject(error);
            });
    });
};

const checkRerunHasProjectName = async projectName => {
    try {
        const resp = await query.getRerunProjectName(projectName);
        if (resp && resp.length > 0) {
            return true;
        } else {
            return false;
        }
    } catch (e) {
        console.log("Error: ", e);
        return false;
    }
};

const updateRerunTraceInfo = (id, trace_id, channel, reply_ts) => {
    return new Promise(function (resolve, reject) {
        // run trace
        const url = api.postTrace(trace_id);
        const headers = {
            "Content-type": "application/json"
        };
        const payload = {
            requiredCapabilities: [{
                browserName: "chrome"
            }]
        };

        const options = {
            method: "POST",
            headers,
            data: JSON.stringify(payload),
            url
        };

        axios(options)
            .then(function (response) {
                const statement = `UPDATE usetrace_rerun ur set ur.reply_thread = "${reply_ts}", ur.channel="${channel}", ur.new_batch_id="${response.data}", ur.started="1", ur.finished="0" where id = "${id}";`;
                db.query(statement, function (err, result) {
                    if (err) {
                        reject("Error: ", err);
                    }
                    resolve("done");
                });
            })
            .catch(function (error) {
                reject("Error: ", error);
            });
    });
};

const rerunFailedTraces = async (projectName, channel, reply_ts) => {
    return new Promise(async function (resolve, reject) {
        try {
            const resp = await query.getRerunProjectName(projectName);
            const promiseArr = [];
            const record = [];
            if (resp && resp.length > 0) {
                for (let [index, item] of resp.entries()) {
                    record.push(`${index + 1}) ${item.trace_name}`);
                    promiseArr.push(
                        updateRerunTraceInfo(item.id, item.trace_id, channel, reply_ts)
                    );
                }

                Promise.all(promiseArr)
                    .then(() => {
                        resolve(record);
                    })
                    .catch(e => reject("Error: ", e));
            }
        } catch (e) {
            console.log("Error: ", e);
            reject(e);
        }
    });
};

const setInvidualJobToFinished = (id) => {
    return new Promise(function (resolve, reject) {
        const statement = `UPDATE usetrace_jobs set finished = "1" where id="${id}";`
        db.query(statement, function (err, result) {
            if (err) {
                reject("Error: ", err);
            } else {
                resolve("done")
            }
        })
    })
}

const flushProjectById = async (projectId) => {
    return new Promise(function (resolve, reject) {
        // update usetrace_job to finished for this projectId;
        const statement = `SELECT * from usetrace_jobs where project_id = "${projectId}" and finished = "0";`;

        db.query(statement, function (err, result) {
            if (err) {
                reject("Error: ", err);
            } else {
                if (result && result.length > 0) {
                    const promiseArr = [];
                    for (let item of result) {
                        promiseArr.push(setInvidualJobToFinished(item.id));
                    }
                    Promise.all(promiseArr).then(() => {
                        axios.post(api.flushProject(projectId))
                            .then(function (response) {
                                console.log(response);
                                resolve("Done flushing project");
                            })
                            .catch(function (error) {
                                reject("Error: ", error);
                            });
                    }).catch((e) => reject("Error: ", e))
                } else {
                    resolve("No running job for this project");
                }
            }
        });
    })
}

exports.getProjectMap = getProjectMap;
exports.getProjectNames = getProjectNames;
exports.runProjectById = runProjectById;
exports.checkResultStatus = checkResultStatus;
exports.getResultByProjectId = getResultByProjectId;
exports.getFailedBrowserSessions = getFailedBrowserSessions;
exports.checkRerunHasProjectName = checkRerunHasProjectName;
exports.rerunFailedTraces = rerunFailedTraces;
exports.deleteAllRerunRecordByProject = deleteAllRerunRecordByProject;
exports.getTagsMap = getTagsMap;
exports.flushProjectById = flushProjectById;