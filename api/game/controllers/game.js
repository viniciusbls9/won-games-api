'use strict';

module.exports = {
  populate: async (ctx) => {
    console.log("Starting to populate...")

    const options = {
      sort: "popularity",
      page: "1",
      ...ctx.query
    }

    await strapi.services.game.populate(options)

    ctx.send("Finished populating!")
  }
};
