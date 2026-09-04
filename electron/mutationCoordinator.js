// Serialize database/filesystem writes. A switch reserves exclusivity immediately,
// waits for earlier writes, and rejects conflicting writes until it completes.
const createMutationCoordinator = () => {
  let queue = Promise.resolve();
  let switching = false;
  return (operation, { switchSkills = false, read = false } = {}) => {
    if (switching && !read) return Promise.reject(new Error('正在切换技能组，请完成后重试。'));
    if (switchSkills) switching = true;
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result.finally(() => { if (switchSkills) switching = false; });
  };
};
module.exports = { createMutationCoordinator };
