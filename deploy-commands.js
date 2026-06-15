const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("money")
    .setDescription("Add BIGPAY to a user's holding (transfers to bank after 2 hours)")
    .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to add").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove BIGPAY from a user's bank")
    .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to remove").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your bank and holding balance"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("View full status of any user (admin only)")
    .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top 10 BIGPAY holders"),

  new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Request a withdrawal from your bank (creates a ticket)")
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to withdraw").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Complete and close a withdrawal ticket (admin only)"),

  new SlashCommandBuilder()
    .setName("qr")
    .setDescription("Generate a UPI payment QR code")
    .addStringOption(o => o.setName("upi_id").setDescription("UPI ID (e.g. name@upi)").setRequired(true))
    .addNumberOption(o => o.setName("amount").setDescription("Amount in ₹").setRequired(true).setMinValue(1)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Registering commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ All commands registered successfully!");
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
