module.exports = {
  now: () => new Date().toISOString(),
  uid: () => Math.random().toString(36).slice(2, 10),
};