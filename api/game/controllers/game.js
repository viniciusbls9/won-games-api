'use strict';

module.exports = {
  populate: async (ctx) => {
    console.log("Starting to populate...")

    await strapi.services.game.populate()

    ctx.send("Finished populating!")
  }
};
