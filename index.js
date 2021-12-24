const CHEERIO = require("cheerio");
const REQUEST = require("request");
const JSONFRAME = require("jsonframe-cheerio");
const CORES = require("os").cpus().length;
const CLUSTER = require("cluster");
const FS = require("fs");
const LAST_PAGE_TO_SCRAPE = 10;
const QUANTITY_OF_PAGES_PER_WORKER = 1;

const BASE_URL = "https://stackoverflow.com/questions?page=";

if (CLUSTER.isMaster) {
  let nextPage = 1;
  for (let i = 0; i < CORES; i++) {
    CLUSTER.fork({ startingPoint: nextPage });
    nextPage += 1;
  }

  CLUSTER.on("online", (worker) => {
    console.log(`Worker ${worker.process.pid} is now working.`);
  });

  CLUSTER.on("exit", (worker, code, signal) => {
    if (code !== 0) {
      //restart
      console.log(`Worker ${worker.process.pid} died. Restarting.`);
      CLUSTER.fork({ startingPoint: worker.process.env.startingPoint });
    } else {
      //scrape next X pages
      console.log(
        `Worker ${worker.process.pid} finished it's work succesfully.`
      );
      if (nextPage <= LAST_PAGE_TO_SCRAPE) {
        CLUSTER.fork({ startingPoint: nextPage });
        nextPage += QUANTITY_OF_PAGES_PER_WORKER;
      }
    }
  });
} else {
  let workerStartingPoint = parseInt(process.env.startingPoint);
  for (
    let i = workerStartingPoint;
    i < workerStartingPoint + QUANTITY_OF_PAGES_PER_WORKER;
    i++
  ) {
    REQUEST(BASE_URL + i, function (error, response, html) {
      if (error) {
        process.exit(workerStartingPoint);
      }
      let $ = CHEERIO.load(html);
      JSONFRAME($);
      let frame = {
        questions: {
          _s: "#questions .question-summary",
          _d: [
            {
              votes:
                ".statscontainer .stats .vote .votes .vote-count-post strong",
              answers: ".statscontainer .stats .status strong",
              url: ".question-hyperlink @ href",
            },
          ],
        },
      };
      let questions = $("body").scrape(frame, { string: true });
      FS.writeFile("page-" + i + ".json", questions, function (error) {
        if (error) {
          process.exit(workerStartingPoint);
        }
        process.exit(0);
      });
    });
  }
}
