const lib = require("./usetrace_lib");

const checkTestStatus = (bot, db) => {
    const statement = `select * from usetrace_jobs uj where uj.finished = '0'`;
    console.log("== statement:", statement);
    db.query(statement, function (e, result) {
        if (result && result.length > 0) {
            for (item of result) {
                lib.checkResultStatus(item.batch_id).then(function (resp) {
                    if (resp) {
                        console.log("test result ready: ", resp);
                        // get test result and update table
                        const mark_done_statement = `update usetrace_jobs uj set uj.finished = '1' where uj.batch_id="${item.batch_id}"`;
                        lib.getResultByProjectId(item.project_id).then(function (inner_response) {

                            const batch = inner_response.data.batch;
                            const report = [];
                            report.push("Name: " + item.project_name);
                            report.push("Id: " + batch.id);
                            report.push("Requested: " + batch.requested);
                            report.push("Finished: " + batch.finished);
                            report.push("Passed: " + batch.passed);
                            report.push("Failed: " + batch.failed)
                            console.log(" ==== report =======");
                            console.log(report.join("\n"));

                            db.query(mark_done_statement, function (err, result) {
                                if (!err) {
                                    const params = {
                                        thread_ts: item.reply_thread
                                    };
                                    bot.postMessage(item.channel, report.join("\n"), params);
                                } else {
                                    console.log("Error: ", err);
                                }
                            })
                        });
                    }
                }).catch(function (err) {
                    console.log("err: ", err);
                });
            }
        }
    });
}

module.exports = checkTestStatus;