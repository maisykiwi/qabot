const api = require("./urls");
const axios = require("axios");
const config = require("./config");

const getProjectMap = () => {
    return new Promise(function (resolve, reject) {
        const url = api.getNames();
        axios.get(url, {
                headers: {
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Accept-Language": "en-US,en;q=0.9",
                    "User-Agent": config.USER_AGENT,
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Referer": "https://team.usetrace.com/",
                    "X-Requested-With": "XMLHttpRequest",
                    "Connection": "keep-alive",
                    "Cookie": config.COOKIES
                }
            }).then(function (response) {
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
                console.log("Error in getProjectNames: ", error);
                reject(error);
            })
    });
};

const getProjectNames = async () => {
    const nameMap = await getProjectMap();
    const keys = Array.from(nameMap.keys());
    return keys.join("\n");
}

const runProjectById = async (id) => {
    const url = api.postProject(id);
    const headers = {
        "Content-type": "application/json"
    };
    const payload = {
        "requiredCapabilities": [{
            "browserName": "chrome"
        }]
    }

    const options = {
        method: "POST",
        headers,
        data: JSON.stringify(payload),
        url
    }

    return new Promise(function (resolve, reject) {
        axios(options).then(function (response) {
            resolve(response.data)
        }).catch(function (error) {
            console.log("error in run project: ", error);
            reject(error);
        })
    });
}

const checkResultStatus = async (batch_id) => {
    return new Promise(function (resolve, reject) {
        try {
            const url = api.checkResultReady(batch_id);
            axios.get(url).then(function (response) {
                resolve(true);
            }).catch(function (error) {
                console.log("Error in getProjectNames: ", error);
                reject(false);
            })
        } catch (e) {
            reject(false);
        }
    })
}

const getResultByProjectId = async (project_id) => {
    return new Promise(function (resolve, reject) {
        const url = ` https://api.usetrace.com/api/project/${project_id}/lastBatchStatus`;
        axios.get(url).then(function (response) {
            console.log("response: ", response);
            resolve(response);
        }).catch(function (error) {
            console.log("Error in getResultByProjectId: ", error);
            reject(error);
        })
    })
}
exports.getProjectMap = getProjectMap;
exports.getProjectNames = getProjectNames;
exports.runProjectById = runProjectById;
exports.checkResultStatus = checkResultStatus;
exports.getResultByProjectId = getResultByProjectId;