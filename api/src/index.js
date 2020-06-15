const SlackBot = require("slackbots");
const config = require("./config");
const lib = require("./usetrace_lib");
const dd_lib = require("./datadog_lib");
const pt_lib = require("./pivotal_tracker_lib");
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

// utbot
let bot = new SlackBot({
  token: config.TOKEN,
  name: config.BOT_NAME
});

// ddbot
let bot2 = new SlackBot({
  token: config.TOKEN2,
  name: config.BOT_NAME2
});

let ptbot = new SlackBot({
  token: config.PTBOT_TOKEN,
  name: config.PTBOT_NAME
});

ptbot.on("start", () => {
  console.log("ptbot started");
})

ptbot.on("error", err => console.log("ptbot Error: ", err));

ptbot.on("message", data => {
  if (data.type === "goodbye" && data.source === "gateway_server") {
    console.log("==gateway closing, trying to reconnect");
    ptbot = new SlackBot({
      token: config.PTBOT_TOKEN,
      name: config.PTBOT_NAME
    });
    ptbot.connect();
  }

  if (data.type !== "message") {
    return;
  }

  if (data.subtype && data.subtype === "message_replied") {
    return;
  }

  if (data.username && (data.username === "utbot" || data.username === "ddbot" || data.username === "ptbot")) {
    return;
  }

  if (!data.text) {
    return;
  }

  if (!data.text.startsWith(config.PTBOT_CODE)) {
    return;
  }
  console.log("=== data text: ", data.text);

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
  if (action.toLowerCase() === "report") {
    // compile report
    pt_lib.getAllDeliveredStories(ptbot, data.channel, reply_ts)
  } else if (action.toLowerCase() === "cycle" || action.toLowerCase() === "cycles") {
    pt_lib.getAllCycles(ptbot, data.channel, reply_ts);
  } else if (data.text.includes("has joined the group")) {
    console.log("joined another channel");
  } else {
    // invalid command
    const params = {
      // thread_ts: reply_ts,
      icon_emoji: ":pivotal:"
    };
    ptbot.postMessage(
      data.channel,
      `Invalid command`,
      params
    );
  }
})

// Docker image is in UTC timezone: 13/1PM UTC === 9AM EST === 6AM PST
cron.schedule("00 00 13 * * *", function () {
  console.log("== run send pt report cron job");
  jobs.compileAndSendPivotalTrackerReport(ptbot);
});


bot2.on("start", () => {
  console.log("ddbot started");
})

bot2.on("error", err => console.log("bot 2 Error: ", err));
bot2.on("message", data => {
  if (data.type === "goodbye" && data.source === "gateway_server") {
    console.log("==gateway closing, trying to reconnect");
    bot2 = new SlackBot({
      token: config.TOKEN2,
      name: config.BOT_NAME2
    });
    bot2.connect();
  }

  if (data.type !== "message") {
    return;
  }

  if (data.subtype && data.subtype === "message_replied") {
    return;
  }

  if (data.username && (data.username === "utbot" || data.username === "ddbot" || data.username === "ptbot")) {
    return;
  }

  if (!data.text) {
    return;
  }

  if (!data.text.startsWith(config.BOT_CODE2)) {
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
  if (action.toLowerCase() === "run") {
    // run all test
    dd_lib.runAllTest(bot2, data.channel, reply_ts);
  } else if (action.toLowerCase() === "rerun") {
    // rerun failure tests
    dd_lib.rerunFailure(bot2, data.channel, reply_ts);
  }
})


// cron.schedule("0 */13 * * * *", function () {
// jobs.pingToAlive(bot);
// });

cron.schedule("45 * * * * *", function () {
  jobs.checkTestStatus(bot, db);
});

cron.schedule("35 * * * * *", function () {
  jobs.checkRerunStatus(bot, db);
});

bot.on("start", () => {
  console.log("utbot started!");
  bot
    .getChannels()
    .then(data => (channelMap = data.channels))
    .catch(e => console.log("Error getting channel map: ", e));

  bot
    .getUsers()
    .then(data => (userMap = data.members))
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
    data.subtype && data.subtype === "message_replied"
  ) {
    return;
  }

  if (data.username && (data.username === "utbot" || data.username === "ddbot" || data.username === "ptbot")) {
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
        const tagIndex = cleaned.includes("tag:") ?
          cleaned.indexOf("tag:") :
          cleaned.indexOf("tags:");
        const tagDivider = cleaned.includes("tag:") ? "tag:" : "tags:";
        if (cleaned.length - 1 === tagIndex) {
          // assume tag is empty
          let pName = cleaned.slice(1);
          pName = pName.join(" ").trim().toLowerCase();
          runProject(pName, data.channel, reply_ts);
        } else {
          const nameForProject = cleaned.slice(1, tagIndex);
          const tagSection = data.text.split(tagDivider);
          let tagsEntered = tagSection[1].split(",");
          tagsEntered = tagsEntered.map(item => item.trim());
          runProject(
            nameForProject.join(" ").trim().toLowerCase(),
            data.channel,
            reply_ts,
            tagsEntered
          );
        }
      } else {
        let name = cleaned.slice(1);
        name = name.join(" ").trim().toLowerCase();
        runProject(name, data.channel, reply_ts);
      }
      break;
    case "rerun":
      let rerun_name = cleaned.slice(1);
      rerun_name = rerun_name.join(" ").trim().toLowerCase();
      rerunFailure(rerun_name, data.channel, reply_ts);
      break;
    case "project":
    case "projects":
      if (cleaned.includes("tag") || cleaned.includes("tags")) {
        let projectName = cleaned.slice(1, cleaned.length - 1);
        getTagsByProjectName(
          projectName.join(" ").trim().toLowerCase(),
          data.channel,
          reply_ts
        );
      } else {
        getAllProjects(data.channel, reply_ts);
      }
      break;
    case "flush":
      let flush_project_name = cleaned.slice(1);
      flush_project_name = flush_project_name.join(" ").trim().toLowerCase();
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
  menu.push(
    "3. To rerun failed tests for a project, use `@utbot rerun <project_name>`, project name is the name you got in step 1. An example would be like: `@utbot rerun ClickFunnels Staging`"
  );
  menu.push(
    "4. To get all available tags for a project, use `@utbot project <project_name> tags`, project name is the name you got in step 1. An example would be like: `@utbot project Staging tags`"
  );
  menu.push(
    "5. To run a project filter by tags, use `@utbot run <project_name> tags: <list of tag names>`, project name is the name you got in step 1, tag names are the names you got in step 4. An example would be like: `@utbot run Staging tags: navbar,smtp`"
  );
  menu.push(
    "6. To flush a project (stop all running tests), use `@utbot flush <project_name>`, project name is the name you got in step 1. An example would be like: `@utbot flush Staging`"
  );
  menu.push("");
  menu.push(
    "When tests finish running, result will be send as a reply thread to your message"
  );
  menu.push("Full user guide: https://docs.google.com/document/d/1nep8eiFjC8V_ULez7qnKIREK4OeVEQbJR4hlD7CFVt4/edit?usp=sharing")
  const params = {
    thread_ts: reply_ts,
    icon_emoji: ":usetrace:"
  };
  bot.postMessage(channel, menu.join("\n\n"), params);
  return;
}

const runProject = async (name, channel, reply_ts, tags = []) => {
  const params = {
    thread_ts: reply_ts,
    icon_emoji: ":usetrace:"
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
      let finalTags = [];
      if (tags.length > 0) {
        finalTags = tags
      } else {
        const tagMap = await lib.getTagsMap();
        const projectMap = await lib.getProjectMap();
        if (projectMap.has(name)) {
          if (tagMap.has(project_id)) {
            const defaultTags = Array.from(tagMap.get(project_id));
            finalTags = defaultTags.filter(item => item !== "routine");
          }
        }
      }

      const resp = await lib.runProjectById(project_id, finalTags);
      await query.insertJob(resp, project_id, name, channel, reply_ts);
      if (tags && tags.length > 0) {
        bot.postMessage(
          channel,
          `Started: ${name} \nTags: ${tags}\nbatch id: ${resp}`,
          params
        );
      } else {
        bot.postMessage(
          channel,
          `Started: ${name} \nbatch id: ${resp}`,
          params
        );
      }

      await lib.deleteAllRerunRecordByProject(name);
      return;
    } else {
      bot.postMessage(
        channel,
        "Invalid project name: " +
        name +
        ", use `@utbot projects` to get all available projects",
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
    thread_ts: reply_ts,
    icon_emoji: ":usetrace:"
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
    thread_ts: reply_ts,
    icon_emoji: ":usetrace:"
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
      bot.postMessage(channel, resp, params);
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
    thread_ts: reply_ts,
    icon_emoji: ":usetrace:"
  };
  bot.postMessage(channel, "invalid action", params);
}

const getAllProjects = async (channel, reply_ts) => {
  try {
    const msg = await lib.getProjectNames();
    const params = {
      thread_ts: reply_ts,
      icon_emoji: ":usetrace:"
    };
    bot.postMessage(channel, msg, params);
  } catch (e) {
    console.log("Error: ", e);
  }
};

const getTagsByProjectName = async (projectName, channel, reply_ts) => {
  const params = {
    thread_ts: reply_ts,
    icon_emoji: ":usetrace:"
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
          const resp = [
            `Available tags for project ${projectName}:\n`,
            ...tags
          ];
          bot.postMessage(channel, resp.join("\n"), params);
        } else {
          bot.postMessage(channel, "No tags for this project yet", params);
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
};

const reportUsage = data => {
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
    config.PING_CHANNEL,
    `Message: ${data.text}, Channel: ${channelName}, User: ${userName}`,
    params
  );
};