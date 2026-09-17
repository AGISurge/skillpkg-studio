const mapPool = async (items, concurrency, mapper) => {
  const list = [...items];
  const results = new Array(list.length);
  let next = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(list.length, 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (next < list.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(list[index], index);
    }
  }));
  return results;
};

const createLimiter = (size) => {
  const limit = Math.max(1, Number(size) || 1);
  let active = 0;
  const waiters = [];
  return {
    size: limit,
    active: () => active,
    acquire() {
      if (active < limit) {
        active += 1;
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    release() {
      const waiter = waiters.shift();
      if (waiter) waiter.resolve();
      else active = Math.max(0, active - 1);
    },
    failWaiting(error) {
      const pending = waiters.splice(0);
      pending.forEach((waiter) => waiter.reject(error));
    },
  };
};

const createMutex = () => {
  let chain = Promise.resolve();
  return (fn) => {
    const run = chain.then(() => fn(), () => fn());
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
};

module.exports = {
  createLimiter,
  createMutex,
  mapPool,
};
