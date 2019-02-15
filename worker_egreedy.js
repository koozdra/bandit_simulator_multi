self.importScripts(
  "https://cdn.jsdelivr.net/g/lodash@4(lodash.min.js+lodash.fp.min.js)"
);

const {
  map,
  last,
  reduce,
  maxBy,
  get,
  filter,
  head,
  isEmpty,
  sample,
  each,
  compact,
  chunk,
  flow
} = _;
const mapWithIndex = map.convert({ cap: false });

let variants = [];
const running = false;
let history = {};
let delayedTasks = [];

const reset = () => {
  history = { chosenVariantIndexes: [], rewards: [] };
  delayedTasks = [];
};

reset();

const selectVariant = (epsilon, minExploreVisits, variants) => {
  const variantsBelowMinVisits = filter(
    variant => variant.bandit.pulls < minExploreVisits
  )(variants);

  if (!isEmpty(variantsBelowMinVisits)) {
    return sample(variantsBelowMinVisits);
  }

  const variantsWithRewards = filter(variant => get("bandit.rewards")(variant))(
    variants
  );

  const isExplore = Math.random() < epsilon;

  if (isExplore || isEmpty(variantsWithRewards)) {
    return sample(variants);
  }

  const variantExpectedValue = variant =>
    variant.bandit.rewards / variant.bandit.pulls;

  return maxBy(variantExpectedValue)(variants);
};

const visit = (epsilon, minExploreVisits, variants, delay, step) => {
  const selectedVariant = selectVariant(epsilon, minExploreVisits, variants);
  const { index, ev, reward = 1 } = selectedVariant;
  history.chosenVariantIndexes.push(index);

  selectedVariant.bandit.pulls += reward;
  if (Math.random() <= ev) {
    const thunk = () => {
      selectedVariant.bandit.rewards += reward;
      history.rewards.push(1);
    };
    delayedTasks.push({ step: step + delay, thunk });
  } else {
    history.rewards.push(0);
  }
};

self.addEventListener("message", event => {
  const {
    messageType,
    iterations,
    minExploreVisits = 10,
    // [{variantName, ev}]
    variants: variantInitList = [
      { ev: 0.2, variantName: "v1" },
      { ev: 0.4, variantName: "v2" },
      { ev: 0.6, variantName: "v3" },
      { ev: 0.8, variantName: "v4" }
    ],
    epsilon = 0.1,
    delay = 10
  } = event.data;

  // console.log("worker:", event.data, variantInitList);

  if (messageType === "start") {
    reset();

    variants = mapWithIndex((variantInit, index) => ({
      ...variantInit,
      index,
      bandit: {
        pulls: 0,
        rewards: 0
      }
    }))(variantInitList);
    const start = new Date();

    for (i = 0; i < iterations; i++) {
      visit(epsilon, minExploreVisits, variants, delay, i);

      delayedTasks = flow(
        map(delayedTask => {
          const { step, thunk } = delayedTask;
          if (i < step && step < iterations) {
            return delayedTask;
          }
          thunk();
          return undefined;
        }),
        compact
      )(delayedTasks);
    }

    const end = new Date();

    const { chosenVariantIndexes, rewards } = history;

    const dataPoints = 100;

    const cumulativeRewards = flow(
      reduce((r, a) => (r.push(a + (last(r) || 0)), r), []),
      chunk(rewards.length / dataPoints),
      map(last)
    )(rewards);

    const bestVariantIndex = flow(
      maxBy("ev"),
      get("index")
    )(variants);

    const cumulativeRegret = flow(
      map(selectedIndex => (selectedIndex !== bestVariantIndex ? 1 : 0)),
      reduce((r, a) => (r.push(a + (last(r) || 0)), r), []),
      chunk(chosenVariantIndexes.length / dataPoints),
      map(last)
    )(chosenVariantIndexes);

    self.postMessage({
      messageType: "runComplete",
      data: [cumulativeRewards, cumulativeRegret]
    });
  }
});
