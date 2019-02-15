const {
  map,
  last,
  maxBy,
  get,
  filter,
  isEmpty,
  sample,
  each,
  flow,
  zipAll,
  zip,
  join,
  curry,
  tap,
  sum
} = _;

const worker = new Worker("worker_egreedy.js");

let chart;
let animating = false;
const state = {
  epsilon: 0.1,
  minExploreVisits: 10,
  delay: 10,
  iterations: 1000,
  variants: [{ ev: 0.2 }, { ev: 0.4 }, { ev: 0.6 }, { ev: 0.8 }]
};

const divideBy = a => b => b / a;

// RunningAverage
const runningAverage = data => ({
  count: 1,
  data
});

function addDomVariant({ ev = 0.5 } = {}) {
  const div = document.getElementById("variants");

  div.insertAdjacentHTML(
    "beforeend",
    `<div><div>
    ev: <input type="number" class="inputVariantEv" onchange="changeEv()" step="0.1" value="${ev}" max="1" min="0" style="width: 3em;"/>
    r: <input type="number" class="inputVariantReward" value="1" step="0.1" min="0" max="100" onchange="changeEv()"/>
    </div></div>`
  );
}

// RunningAverage -> RunningAverage
const updateRunningAverage = ({ count, data: previousData }, data) => ({
  count: count + 1,
  data: flow(
    zip(previousData),
    map(sum)
    // map(divideBy(count + 1))
  )(data)
});

// RunningAverage -> [Integer]
const runningAverageDisplayData = ({ count, data }) => {
  return map(divideBy(count))(data);
};

let cumulativeRegretRunningAverage;
let cumulativeRewardRunningAverage;

function callWorker(worker) {
  worker.postMessage({
    messageType: "start",
    ...state
  });
}

function logToElement(id, data) {
  document.getElementById(id).innerHTML = data;
}

worker.addEventListener("message", event => {
  const { messageType, data } = event.data;

  const [cumulativeReward, cumulativeRegret] = data;

  cumulativeRegretRunningAverage = cumulativeRegretRunningAverage
    ? updateRunningAverage(cumulativeRegretRunningAverage, cumulativeRegret)
    : runningAverage(cumulativeRegret);

  cumulativeRewardRunningAverage = cumulativeRewardRunningAverage
    ? updateRunningAverage(cumulativeRewardRunningAverage, cumulativeReward)
    : runningAverage(cumulativeReward);

  const rewardDisplay = runningAverageDisplayData(
    cumulativeRewardRunningAverage
  );
  const regretDisplay = runningAverageDisplayData(
    cumulativeRegretRunningAverage
  );

  logToElement("outputTotalRewardAverage", last(rewardDisplay).toFixed(2));
  logToElement("outputTotalRegretAverage", last(regretDisplay).toFixed(2));

  const columns = [
    ["Cumulative Reward", ...cumulativeReward],
    ["Cumulative Regret", ...cumulativeRegret],
    ["Cumulative Reward (average)", ...rewardDisplay],
    ["Cumulative Regret (average)", ...regretDisplay]
  ];

  chart.load({
    columns,
    type: "spline",
    done: () => {
      if (animating) {
        callWorker(worker);
      }
    }
  });

  // const html = flow(
  //   zipAll,
  //   map(join(", ")),
  //   join("<br/>")
  // )(data);
  // document.getElementById("output").innerHTML = html;
});

function init() {
  chart = c3.generate({
    bindto: "#chart",
    transition: {
      duration: 0
    },
    data: {
      columns: [["Cumulative Reward"]]
    }
  });

  map(addDomVariant)(state.variants);
}

function run() {
  animating = true;
  callWorker(worker);
}

function stop() {
  animating = false;
}

function changeEpsilon(epsilonVal) {
  state.epsilon = parseFloat(epsilonVal);
  reset();
}

function changeMinVisits(minVisitsVal) {
  state.minExploreVisits = parseInt(minVisitsVal);
  reset();
}

function changeDelay(delayVal) {
  state.delay = parseInt(delayVal);
  reset();
}

function reset() {
  cumulativeRegretRunningAverage = undefined;
  cumulativeRewardRunningAverage = undefined;
}

function changeIterations(inputValue) {
  state.iterations = parseInt(inputValue);
  reset();
}

function changeEv() {
  const div = document.getElementById("variants");
  const evInputs = div.getElementsByClassName("inputVariantEv");
  const rewardInputs = div.getElementsByClassName("inputVariantReward");

  const inputs = zip(evInputs, rewardInputs);

  state.variants = map(
    flow(
      map(
        flow(
          i => i.value,
          parseFloat
        )
      ),
      ([ev, reward]) => ({ ev, reward })
    )
  )(inputs);

  reset();
}

function addVariant() {
  addDomVariant();
  changeEv();
}
