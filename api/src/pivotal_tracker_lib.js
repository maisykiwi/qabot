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