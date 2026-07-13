const proxy = require('../../../_proxy');
module.exports = (req, res) => proxy(req, res, '/admin/offers/active');
