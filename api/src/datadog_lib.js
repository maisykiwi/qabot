const axios = require("axios");
const config = require("./config");
const moment = require("moment-timezone");
const query = require("./database");

const instance = axios.create({
  baseURL: "https://app.datadoghq.com/api/v1",
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
    "DD-API-KEY": config.DDOG_API_KEY,
    "DD-APPLICATION-KEY": config.DDOG_APP_KEY
  }
});

const instance_private = axios.create({
  baseURL: "https://app.datadoghq.com/api/v1",
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
    cookie: config.DDOG_COOKIES,
    "user-agent": config.DDOG_AGENT
  }
});

const runAllTest = async (bot2, channel, reply_ts) => {
  var params = {
    thread_ts: reply_ts,
    icon_emoji: ":datadog:"
  };

  instance
    .get("/synthetics/tests")
    .then(async function (resp) {
      if (resp && resp.data && resp.data.tests && resp.data.tests.length > 0) {
        const tests = resp.data.tests;
        const public_id_arr = [];
        /*                 for (let i = 0; i < tests.length; i++) {
                                            let item = tests[i];
                                            try {
                                                let updated = await runSingleTestById(item.public_id);
                                                testMap.push({
                                                    "id": item.public_id,
                                                    "tags": item.tags,
                                                    "name": item.name,
                                                    "status": item.status,
                                                    "updated": updated
                                                })
                                            } catch (e) {
                                                console.log("Error: ", e);
                                            }
                                        } */
        const testMap = {};

        tests.map(item => {
          if (item.status === "live") {
            public_id_arr.push(item.public_id);
            testMap[item.public_id] = {
              tags: item.tags,
              name: item.name,
              status: item.status
            };
          }
        });

        const resp_msg = ["Running following tests: "];
        try {
          const resp = await run_all_tests_via_cookies(public_id_arr);
          if (resp && resp.triggered_check_ids) {
            for (let [index, item] of resp.triggered_check_ids.entries()) {
              if (testMap.hasOwnProperty(item)) {
                resp_msg.push(`${index + 1}) ${testMap[item].name}`);
              }
            }
          }
        } catch (e) {
          if (e && e.response && e.response.status === 403) {
            bot2.postMessage(channel, "Token expired, please update it", params);
          } else {
            bot2.postMessage(channel, JSON.stringify(e), params);
          }
          return;
        }

        bot2.postMessage(channel, resp_msg.join("\n"), params);

        setTimeout(async function () {
          try {
            const resp = await getAllTestResult(public_id_arr, testMap);
            bot2.postMessage(channel, resp, params);
          } catch (e) {
            console.log("Error: ", e);
          }
        }, 300000);
      }
    })
    .catch(function (error) {
      console.log("Error calling get all test result: ", error);
    });
};

const rerunFailure = async (bot2, channel, reply_ts) => {
  var params = {
    thread_ts: reply_ts,
    icon_emoji: ":datadog:"
  };

  let rerunIdArr;
  // get failure id
  try {
    const resp = await query.getDatadogFailures();
    const result = resp[0];
    rerunIdArr = result && result.public_id_arr && result.public_id_arr.length > 0 ? result.public_id_arr.split(",") : [];
  } catch (e) {
    console.log("Error: ", e);
  }

  if (!rerunIdArr || rerunIdArr === "" || rerunIdArr.length === 0) {
    bot2.postMessage(channel, "No failure record, please just use `@ddbot run`", params);
    return;
  }

  instance
    .get("/synthetics/tests")
    .then(async function (resp) {
      if (resp && resp.data && resp.data.tests && resp.data.tests.length > 0) {
        const tests = resp.data.tests;
        const testMap = {};

        tests.map(item => {
          testMap[item.public_id] = {
            tags: item.tags,
            name: item.name,
            status: item.status
          };
        });

        const resp_msg = ["Rerunning following tests: "];
        try {
          const resp = await run_all_tests_via_cookies(rerunIdArr);
          if (resp && resp.triggered_check_ids) {
            for (let [index, item] of resp.triggered_check_ids.entries()) {
              if (testMap.hasOwnProperty(item)) {
                resp_msg.push(`${index + 1}) ${testMap[item].name}`);
              }
            }
          }
        } catch (e) {
          console.error("Error: ", e);
        }

        bot2.postMessage(channel, resp_msg.join("\n"), params);

        setTimeout(async function () {
          try {
            const resp = await getAllTestResult(rerunIdArr, testMap);
            bot2.postMessage(channel, resp, params);
          } catch (e) {
            console.log("Error: ", e);
          }
        }, 300000);
      }
    })
    .catch(function (error) {
      console.log("Error calling get all test result: ", error);
    });
}

const runSingleTestById = publicId => {
  return new Promise((resolve, reject) => {
    const body = {
      new_status: "live"
    };
    instance
      .put(`/synthetics/tests/${publicId}/status`, body)
      .then(function (resp) {
        resolve(resp.data);
      })
      .catch(function (error) {
        console.log("Error calling single test api: ", error);
        reject(error);
      });
  });
};

const run_all_tests_via_cookies = arr => {
  return new Promise((resolve, reject) => {
    const body = {
      public_ids: arr,
      _authentication_token: config.DDOG_AUTH_TOKEN
    };

    instance_private
      .post("/synthetics/tests/trigger", body)
      .then(function (resp) {
        resolve(resp.data);
      })
      .catch(function (error) {
        console.log("Error calling trigger all test api: ", error);
        reject(error);
      });
  });
};

const getSingleTestResultById = publicId => {
  return new Promise((resolve, reject) => {
    instance
      .get(`/synthetics/tests/${publicId}/results`)
      .then(function (resp) {
        resolve(resp.data.results);
      })
      .catch(function (error) {
        console.log("Error get single test result: ", error);
        reject(error);
      });
  });
};

const getAllTestResult = async (arr, map) => {
  return new Promise(async (resolve, reject) => {
    const errArr = [];
    const report = ["Test Results:"];
    for (let [i, v] of arr.entries()) {
      try {
        const resp = await getSingleTestResultById(v);

        if (resp && resp.length > 1) {
          report.push(`${i + 1}) ${map[v].name}`);
          const first = resp[0];
          const first_timestamp = moment(first.check_time)
            .tz("America/New_York")
            .format("MM-DD-YYYY HH:mm:ss");

          if (first.result && first.result.errorMessage) {
            report.push(`>> ${first_timestamp} (EST) - [Failed]`);
            report.push(`   Error message: ${first.result.errorMessage}`);
          } else {
            report.push(`>> ${first_timestamp} (EST) - [Passed]`);
          }

          // const second = resp[1];
          // const second_timestamp = moment(second.check_time)
          //   .tz("America/New_York")
          //   .format("MM-DD-YYYY HH:mm:ss");

          // if (second.result && second.result.errorMessage) {
          //   report.push(`>> ${second_timestamp} (EST) - [Failed]`);
          //   report.push(`   Error message: ${second.result.errorMessage}`);
          // } else {
          //   report.push(`>> ${second_timestamp} (EST) - [Passed]`);
          // }

          if (first.result && first.result.errorMessage) {
            // save error id for rerun later
            errArr.push(v);
          }
        }
      } catch (e) {
        console.log("Error: ", e);
        report.push(`${i + 1}) ${map[v].name}`);
        report.push("Error getting result, please check manually");
      }
    }
    if (errArr.length > 0) {
      try {
        await query.insertDatadogFailures(errArr.join(","));
      } catch (e) {
        console.log("Error insert rerun id for datadog: ", errArr);
      }
    }
    resolve(report.join("\n"));
  });
};

exports.runAllTest = runAllTest;
exports.rerunFailure = rerunFailure;