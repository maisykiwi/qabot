const axios = require("axios");
const config = require("./config");

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

        console.log("=== final report: ", reports);
        bot.postMessage(
            channel,
            reports.join("\n\n"),
            params
        );
    }).catch(function (e) {
        console.log("Error solving all promise: ", e);
    });
}

const getStoriesByProjectId = (name, projectId) => {
    return new Promise((resolve, reject) => {
        instance
            .get(`/${projectId}/stories?date_format=millis&with_state=delivered`)
            .then(async function (resp) {
                console.log("=== resp.data: ", resp.data);
                if (!resp || !resp.data || resp.data.length === 0) {
                    resolve(`*Project: ${name}*\n:man-shrugging: no delivered story`);
                } else {
                    let result = `*Project: ${name}*`;
                    resp.data.map((item, index) => {
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
};

exports.getAllDeliveredStories = getAllDeliveredStories;