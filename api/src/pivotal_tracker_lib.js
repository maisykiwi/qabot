const axios = require("axios");
const config = require("./config");
const moment = require("moment-timezone");

const instance = axios.create({
    baseURL: "https://www.pivotaltracker.com/services/v5/projects",
    timeout: 8000,
    headers: {
        "Content-Type": "application/json",
        "X-TrackerToken": config.PIVOTAL_TRACKER_TOKEN,
    }
});

const getAllDeliveredStories = async (bot, channel, reply_ts) => {
    const projects = config.PIVOTAL_TRACKER_PROJECTS;

    if (!projects) {
        return "No projects in configuration";
    }

    const promiseArr = [];

    projects.map(item => promiseArr.push(getStoriesByProjectId(item.name, item.projectId)));

    Promise.all(promiseArr).then(function (reports) {
        const params = {
            // thread_ts: reply_ts,
            icon_emoji: ":pivotal:"
        };
        const now = moment()
            .tz("America/New_York")
            .format("MM-DD-YYYY HH:mm:ss");
        const startDate = moment().subtract(1, "days").tz("America/New_York")
            .format("MM-DD-YYYY HH:mm:ss");

        const header = `Report for _${startDate}_ - _${now}_ EST\n\n`;
        bot.postMessage(
            channel,
            header + reports.join("\n\n"),
            params
        );
    }).catch(function (e) {
        console.log("Error solving all promise: ", e);
    });
}

const getAllCycles = async (bot, channel, reply_ts) => {
    const projects = config.PIVOTAL_TRACKER_PROJECTS;

    if (!projects) {
        return "No projects in configuration";
    }

    const promiseArr = [];

    projects.map(item => promiseArr.push(getCycleByProjectId(item.name, item.projectId)));

    Promise.all(promiseArr).then(function (cycles) {
        cycles.forEach(cycle => {
            const params = {
                // thread_ts: reply_ts,
                icon_emoji: ":pivotal:",
                "blocks": cycle,
            };

            bot.postMessage(
                channel,
                "reports",
                params,

            );
        });
    }).catch(function (e) {
        console.log("Error solving all promise: ", e);
    });
}

const getStoriesByProjectId = (name, projectId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const acceptedStories = await getStoriesByProjectIdInAcceptedState(name, projectId);
            const deliveredStories = await getStoriesByProjectIdInDeliveredState(name, projectId);

            if ((!acceptedStories || acceptedStories === "") && (!deliveredStories || deliveredStories === "")) {
                resolve(`*Project: ${name}*\n:man-shrugging: no delivered story`);
            } else {
                let result = `*Project: ${name}*`;
                if (acceptedStories) {
                    result += acceptedStories;
                }
                if (deliveredStories) {
                    result += deliveredStories;
                }
                resolve(result);
            }
        } catch (e) {
            console.log("Error in getStoriesByProjectId: ", e);
        }
    })
};

const getCycleByProjectId = (name, projectId) => {
    const url = `/${projectId}/iterations?date_format=millis&fields=number%2Cstart%2Cfinish%2Cstories%28id%2Cname%2Ccurrent_state%2Cstory_type%2Cestimate%2Cowners%2Clabels%28%3Adefault%2Chas_epic%29%2Ccycle_time_details%29&limit=12&offset=-11&scope=done_current`;
    const result = [];
    result.push(
        {
            "type": "divider"
        },
    );
    result.push({
        "type": "section",
        "text": {
            "type": "plain_text",
            "text": `:wand: Project: ${name}`,
            "emoji": true
        }
    });
    return new Promise(async (resolve, reject) => {
        try {
            instance.get(url)
                .then(async function (resp) {
                    if (resp && resp.data && resp.data.length > 0) {
                        const data = resp.data;
                        data.slice(-2).map(item => {

                            result.push({
                                "type": "section",
                                "text": {
                                    "type": "plain_text",
                                    "text": `:clock9: Iteration: ${moment(item.start).tz("America/New_York").format("MM/DD/YY")} - ${moment(item.finish).tz("America/New_York").format("MM/DD/YY")}`,
                                    "emoji": true
                                }
                            })

                            if (item.stories && item.stories.length > 0) {
                                item.stories.map(story => {
                                    if (story.cycle_time_details && story.cycle_time_details.total_cycle_time && (story.cycle_time_details.total_cycle_time / 3600000 > 240)) {
                                        let hours = story.cycle_time_details.total_cycle_time / 3600000;

                                        result.push({
                                            "type": "section",
                                            "text": {
                                                "type": "mrkdwn",
                                                "text": `:star: *Name*: ${story.name} [*Owners*: ${story.owners.map(item => item.name).join(", ")}] https://www.pivotaltracker.com/n/projects/${projectId}/stories/${story.id}`,
                                            }
                                        });

                                        const fields = [];

                                        fields.push({
                                            "type": "mrkdwn",
                                            "text": `*Cycle Time:* ${hours.toFixed(2)} hrs`,
                                        });

                                        if (story.cycle_time_details.rejected_count && story.cycle_time_details.rejected_count > 0) {
                                            fields.push({
                                                "type": "mrkdwn",
                                                "text": `*Rejections:* ${story.cycle_time_details.rejected_count}`,
                                            });
                                        }

                                        if (story.cycle_time_details.started_time && story.cycle_time_details.started_time > 0) {
                                            const started = story.cycle_time_details.started_time / 3600000;
                                            if (started.toFixed(2)) {
                                                fields.push({
                                                    "type": "mrkdwn",
                                                    "text": `*Started:* ${started.toFixed(2)} hrs`,
                                                })
                                            }
                                        }

                                        if (story.cycle_time_details.finished_time && story.cycle_time_details.finished_time > 0) {
                                            const finished = story.cycle_time_details.finished_time / 3600000;
                                            if (finished.toFixed(2) > 0) {
                                                fields.push({
                                                    "type": "mrkdwn",
                                                    "text": `*Finished:* ${finished.toFixed(2)} hrs`,
                                                })
                                            }
                                        }

                                        if (story.cycle_time_details.delivered_time && story.cycle_time_details.delivered_time > 0) {
                                            const delivered = story.cycle_time_details.delivered_time / 3600000;
                                            if (delivered.toFixed(2) > 0) {
                                                fields.push({
                                                    "type": "mrkdwn",
                                                    "text": `*Delivered:* ${delivered.toFixed(2)} hrs`,
                                                });
                                            }
                                        }

                                        if (story.cycle_time_details.rejected_time && story.cycle_time_details.rejected_time > 0) {
                                            const rejectedTime = story.cycle_time_details.rejected_time / 3600000;
                                            fields.push({
                                                "type": "mrkdwn",
                                                "text": `*Rejected:* ${rejectedTime.toFixed(2)} hrs`,
                                            });
                                        }

                                        result.push({
                                            "type": "section",
                                            "fields": fields,
                                        })
                                    }
                                })
                            }
                        })
                        resolve(result)
                    } else {
                        resolve(result)
                    }
                })
        } catch (e) {
            console.log("Error in getCycleByProjectId: ", e);
            reject(e);
        }
    })
}

const getStoriesByProjectIdInAcceptedState = (name, projectId) => {
    // with_state = accepted
    // accepted_after = now - 1 day
    const startDate = moment().subtract(1, "days").valueOf();
    const url = `/${projectId}/stories?date_format=millis&with_state=accepted&accepted_after=${startDate}`;

    return new Promise((resolve, reject) => {
        instance
            .get(url)
            .then(async function (resp) {
                if (!resp || !resp.data || resp.data.length === 0) {
                    resolve("");
                } else {
                    let result = "";
                    resp.data.filter(item => item.story_type === "feature" || item.story_type === "bug").map((item, index) => {
                        result += "\n" + `:white_check_mark: _${item.name}_` + `\n        ${item.url}`
                    })
                    resolve(result);
                }
            })
            .catch(function (e) {
                console.log("Error: ", e)
                reject(e);
            })
    })
}

const getStoriesByProjectIdInDeliveredState = (name, projectId) => {
    // with_state = accepted
    // accepted_after = now - 1 day
    const startDate = moment().subtract(1, "days").valueOf();
    const url = `/${projectId}/stories?date_format=millis&with_state=delivered&updated_after=${startDate}`;
    return new Promise((resolve, reject) => {
        instance
            .get(url)
            .then(async function (resp) {
                if (!resp || !resp.data || resp.data.length === 0) {
                    resolve("");
                } else {
                    let result = "";
                    resp.data.filter(item => item.story_type === "feature" || item.story_type === "bug").map((item, index) => {
                        result += "\n" + `:wand: _${item.name}_` + `\n        ${item.url}`
                    })
                    resolve(result);
                }
            })
            .catch(function (e) {
                console.log("Error: ", e)
                reject(e);
            })
    })
}

exports.getAllDeliveredStories = getAllDeliveredStories;
exports.getAllCycles = getAllCycles;