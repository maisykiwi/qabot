const SlackBot = require("slackbots");
const config = require("./config");
const lib = require("./usetrace_lib");
const cron = require("node-cron");
const jobs = require("./cron-job");
const mysql = require("mysql");
const query = require("./database");

const db = mysql.createConnection({
  host: process.env["DATABASE_HOST"],
  user: process.env["DATABASE_USER"],
  password: process.env["DATABASE_PASS"],
  database: process.env["DATABASE_DB"],
  port: process.env["DATABASE_PORT"]
});

let channelMap = null;
let userMap = null;

db.connect(err => {
  if (err) {
    throw err;
  }
  console.log("Connected to database");
});
global.db = db;

let bot = new SlackBot({
  token: config.TOKEN,
  name: config.BOT_NAME
});

cron.schedule("0 */13 * * * *", function () {
  jobs.pingToAlive(bot);
});

cron.schedule("45 * * * * *", function () {
  jobs.checkTestStatus(bot, db);
});

/* cron.schedule("35 * * * * *", function () {
  jobs.checkRerunStatus(bot, db);
}); */

bot.on("start", () => {
  console.log("utbot started!");
  bot.getChannels()
    .then((data) => channelMap = data.channels)
    .catch(e => console.log("Error getting channel map: ", e));

  bot.getUsers()
    .then(data => userMap = data.members)
    .catch(e => console.log("Error getting users map: ", e));
});

bot.on("error", err => console.log("Error: ", err));

bot.on("close", () => {
  console.log(">>> bot connection is closed, restart again");
  bot = null;
  bot = new SlackBot({
    token: config.TOKEN,
    name: config.BOT_NAME
  });
  bot.connect();
});

bot.on("message", data => {
  console.log("==== data: ", data);
  if (data.type === "goodbye" && data.source === "gateway_server") {
    console.log("==gateway closing, trying to reconnect");
    bot = new SlackBot({
      token: config.TOKEN,
      name: config.BOT_NAME
    });
    bot.connect();
  }

  if (data.type !== "message") {
    return;
  }

  if (
    data.subtype &&
    (data.subtype === "message_replied" || data.subtype === "bot_message")
  ) {
    return;
  }

  if (data.username && data.username === "utbot") {
    return;
  }

  if (!data.text) {
    return;
  }

  if (!data.text.startsWith(config.BOT_CODE)) {
    return;
  }

  // report usage
  reportUsage(data);

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

  switch (action.toLowerCase()) {
    case "help":
      helpMenu(data.channel, reply_ts);
      break;
    case "run":
      if (cleaned.includes("tag:") || cleaned.includes("tags:")) {
        const tagIndex = cleaned.includes("tag:") ? cleaned.indexOf("tag:") : cleaned.indexOf("tags:");
        const tagDivider = cleaned.includes("tag:") ? "tag:" : "tags:";
        if (cleaned.length - 1 === tagIndex) {
          // assume tag is empty
          let pName = cleaned.slice(1);
          pName = pName.join(" ").trim();
          runProject(pName, data.channel, reply_ts);
        } else {
          const nameForProject = cleaned.slice(1, tagIndex);
          const tagSection = data.text.split(tagDivider);
          console.log("=== tagSection: ", tagSection);
          let tagsEntered = tagSection[1].split(",");
          tagsEntered = tagsEntered.map(item => item.trim())
          console.log(" ====> tagsEntered: ", tagsEntered);
          runProject(nameForProject.join(" ").trim(), data.channel, reply_ts, tagsEntered);
        }
      } else {
        let name = cleaned.slice(1);
        name = name.join(" ").trim();
        runProject(name, data.channel, reply_ts);
      }
      break;
    case "rerun":
      let rerun_name = cleaned.slice(1);
      rerun_name = rerun_name.join(" ").trim();
      rerunFailure(rerun_name, data.channel, reply_ts);
      break;
    case "project":
    case "projects":
      if (cleaned.includes("tag") || cleaned.includes("tags")) {
        let projectName = cleaned.slice(1, cleaned.length - 1);
        console.log("==== projectName: ", projectName);
        getTagsByProjectName(projectName.join(" ").trim(), data.channel, reply_ts);
      } else {
        getAllProjects(data.channel, reply_ts);
      }
      break;
    case "flush":
      let flush_project_name = cleaned.slice(1);
      flush_project_name = flush_project_name.join(" ").trim();
      flushProject(flush_project_name, data.channel, reply_ts);
      break;
    default:
      invalidAction(data.channel, reply_ts);
      break;
  }
});

function helpMenu(channel, reply_ts) {
  const menu = [];
  menu.push("1. To see all available project names, use `@utbot projects`");
  menu.push(
    "2. To run tests for a project, use `@utbot run <project_name>`, project name is the name you got in step 1. An example would be like: `@utbot run ClickFunnels Staging`"
  );
  menu.push("");
  menu.push(
    "When tests finish running, result will be send as a reply thread to your message"
  );
  const params = {
    thread_ts: reply_ts
  };
  bot.postMessage(channel, menu.join("\n\n"), params);
  return;
}

const runProject = async (name, channel, reply_ts, tags = []) => {
  const params = {
    thread_ts: reply_ts
  };
  if (!name) {
    bot.postMessage(
      channel,
      "Please give me a project name, use `@utbot projects` to get all available projects",
      params
    );
    return;
  }

  try {
    const map = await lib.getProjectMap();
    if (map.has(name)) {
      const project_id = map.get(name);

      const resp = await lib.runProjectById(project_id, tags);
      await query.insertJob(resp, project_id, name, channel, reply_ts);
      if (tags && tags.length > 0) {
        bot.postMessage(channel, `Started: ${name} \nTags: ${tags}\nbatch id: ${resp}`, params);
      } else {
        bot.postMessage(channel, `Started: ${name} \nbatch id: ${resp}`, params);
      }

      await lib.deleteAllRerunRecordByProject(name);
      return;
    } else {
      bot.postMessage(
        channel,
        "Invalid project name: " + name + ", use `@utbot projects` to get all available projects",
        params
      );
      return;
    }
  } catch (e) {
    console.log("Error: ", e);
    bot.postMessage(channel, `Error: ${e}`, params);
  }
};

const rerunFailure = async (name, channel, reply_ts) => {
  const params = {
    thread_ts: reply_ts
  };
  if (!name) {
    bot.postMessage(
      channel,
      "Please give me a project name, use `@utbot projects` to get all available projects",
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
        ", use `@utbot run " +
        name +
        "` to run all traces again",
        params
      );
    }
  } catch (e) {
    console.log("Error: ", e);
  }
};

const flushProject = async (name, channel, reply_ts) => {
  const params = {
    thread_ts: reply_ts
  };
  if (!name) {
    bot.postMessage(
      channel,
      "Please give me a project name, use `@utbot projects` to get all available projects",
      params
    );
    return;
  }

  try {
    const projectMap = await lib.getProjectMap();
    if (projectMap.has(name)) {
      const resp = await lib.flushProjectById(projectMap.get(name));
      bot.postMessage(
        channel,
        resp,
        params
      );
    } else {
      bot.postMessage(
        channel,
        "Invalid project name, use `@utbot projects` to get all available projects",
        params
      );
    }
  } catch (e) {
    console.log("Error: ", e);
  }
};

function invalidAction(channel, reply_ts) {
  const params = {
    thread_ts: reply_ts
  };
  bot.postMessage(channel, "invalid action", params);
}

const getAllProjects = async (channel, reply_ts) => {
  try {
    const msg = await lib.getProjectNames();
    const params = {
      thread_ts: reply_ts
    };
    bot.postMessage(channel, msg, params);
  } catch (e) {
    console.log("Error: ", e);
  }
};

const getTagsByProjectName = async (projectName, channel, reply_ts) => {
  const params = {
    thread_ts: reply_ts
  };
  try {
    const tagMap = await lib.getTagsMap();
    const projectMap = await lib.getProjectMap();
    if (projectMap.has(projectName)) {
      const projectId = projectMap.get(projectName);
      if (tagMap.has(projectId)) {
        const tags = Array.from(tagMap.get(projectId));
        if (tags.length > 0) {
          tags.sort(function (a, b) {
            if (a > b) {
              return 1;
            }
            if (b > a) {
              return -1;
            }
            return 0;
          });
          const resp = [`Available tags for project ${projectName}:\n`, ...tags];
          bot.postMessage(
            channel,
            resp.join("\n"),
            params
          );

        } else {
          bot.postMessage(
            channel,
            "No tags for this project yet",
            params
          );
        }
      } else {
        bot.postMessage(
          channel,
          "Sorry, cannot find tags for this project",
          params
        );
      }
    } else {
      bot.postMessage(
        channel,
        "Invalid project name, use `@utbot projects` to get all available projects",
        params
      );
    }
  } catch (e) {
    console.log("Error getting tags by project name: ", e);
  }
}

const reportUsage = (data) => {
  if (!data) {
    return;
  }
  let channelName = "";
  let userName = "";
  if (channelMap) {
    channelObj = channelMap.filter(item => item.id === data.channel);
    channelName = channelObj[0].name;
  }

  if (userMap) {
    userObj = userMap.filter(item => item.id === data.user);
    userName = userObj[0].name;
  }

  var params = {
    icon_emoji: ':cherry_blossom:'
  };
  bot.postMessage(config.PING_CHANNEL, `Message: ${data.text}, Channel: ${channelName}, User: ${userName}`, params);
};