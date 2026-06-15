const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const QRCode = require("qrcode");
const http = require("http");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const OWNER_ROLE   = process.env.OWNER_ROLE_ID   || "OWNER_ROLE_ID";
const FINANCE_ROLE = process.env.FINANCE_ROLE_ID  || "FINANCE_ROLE_ID";
const BANK_ROLE    = process.env.BANK_ROLE_ID     || "BANK_ROLE_ID";

const DB_PATH = "./database.json";
let db = { users: {} };
if (fs.existsSync(DB_PATH)) {
  try { db = JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch (e) { console.error("DB read error:", e.message); }
}

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getUser(id) {
  if (!db.users[id]) {
    db.users[id] = { bank: 0, holding: 0, holdingData: [], pending: 0 };
  }
  return db.users[id];
}

function hasAccess(member) {
  return (
    member.roles.cache.has(OWNER_ROLE) ||
    member.roles.cache.has(FINANCE_ROLE) ||
    member.roles.cache.has(BANK_ROLE)
  );
}

client.once("clientReady", () => {
  console.log(`🔥 Bot Ready: ${client.user.tag}`);
});

// Auto transfer holding → bank every 1 min
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const id in db.users) {
    const user = db.users[id];
    if (!user.holdingData || user.holdingData.length === 0) continue;
    user.holdingData = user.holdingData.filter(item => {
      if (now >= item.time) {
        user.bank    += item.amount;
        user.holding -= item.amount;
        changed = true;
        return false;
      }
      return true;
    });
  }
  if (changed) saveDB();
}, 60000);

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;

  // /money
  if (name === "money") {
    if (!hasAccess(interaction.member)) {
      return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    }
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const u = getUser(target.id);
    const transferTime = Date.now() + 2 * 60 * 60 * 1000;
    u.holding += amount;
    u.holdingData.push({ amount, time: transferTime });
    saveDB();
    const transferAt = new Date(transferTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return interaction.reply(`💰 **${amount} BIGPAY** added to **${target.username}'s** holding.\n⏳ Will transfer to bank at **${transferAt}**.`);
  }

  // /remove
  if (name === "remove") {
    if (!hasAccess(interaction.member)) {
      return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    }
    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const u = getUser(target.id);
    if (u.bank < amount) {
      return interaction.reply({ content: `❌ **${target.username}** only has **${u.bank} BIGPAY** in their bank.`, ephemeral: true });
    }
    u.bank -= amount;
    saveDB();
    return interaction.reply(`🗑️ **${amount} BIGPAY** removed from **${target.username}'s** bank.\n🏦 Current bank balance: **${u.bank} BIGPAY**`);
  }

  // /balance
  if (name === "balance") {
    const u = getUser(interaction.user.id);
    const now = Date.now();
    let holdingLines = "";
    if (u.holdingData && u.holdingData.length > 0) {
      holdingLines = "\n\n**Holding Breakdown:**\n" + u.holdingData.map(item => {
        const mins = Math.ceil((item.time - now) / 60000);
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        return `• ${item.amount} BIGPAY → transfers in ${hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`}`;
      }).join("\n");
    }
    return interaction.reply(`💼 **${interaction.user.username}'s Balance**\n\n🏦 **Bank:** ${u.bank} BIGPAY\n⏳ **Holding:** ${u.holding} BIGPAY${holdingLines}`);
  }

  // /status
  if (name === "status") {
    if (!hasAccess(interaction.member)) {
      return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    }
    const target = interaction.options.getUser("user");
    const u = getUser(target.id);
    const now = Date.now();
    let holdingLines = "None";
    if (u.holdingData && u.holdingData.length > 0) {
      holdingLines = u.holdingData.map(item => {
        const mins = Math.ceil((item.time - now) / 60000);
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        return `• ${item.amount} BIGPAY → transfers in ${hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`}`;
      }).join("\n");
    }
    return interaction.reply(
      `📋 **Status: ${target.username}**\n\n` +
      `🏦 **Bank:** ${u.bank} BIGPAY\n` +
      `⏳ **Holding:** ${u.holding} BIGPAY\n` +
      `🔄 **Pending Withdrawal:** ${u.pending || 0} BIGPAY\n\n` +
      `**Holding Breakdown:**\n${holdingLines}`
    );
  }

  // /leaderboard
  if (name === "leaderboard") {
    const sorted = Object.entries(db.users)
      .filter(([, u]) => (u.bank + u.holding) > 0)
      .sort(([, a], [, b]) => (b.bank + b.holding) - (a.bank + a.holding))
      .slice(0, 10);
    if (sorted.length === 0) return interaction.reply("📊 No one has any BIGPAY yet!");
    const medals = ["🥇", "🥈", "🥉"];
    const lines = sorted.map(([id, u], i) => {
      const total = u.bank + u.holding;
      return `${medals[i] || `**${i + 1}.**`} <@${id}> — 🏦 ${u.bank} | ⏳ ${u.holding} | Total: **${total} BIGPAY**`;
    });
    return interaction.reply(`🏆 **BIG DEAL Leaderboard (Top ${sorted.length})**\n\n${lines.join("\n")}`);
  }

  // /withdraw
  if (name === "withdraw") {
    const amount = interaction.options.getInteger("amount");
    const user = interaction.user;
    const u = getUser(user.id);
    if (u.bank < amount) {
      return interaction.reply({ content: `❌ You only have **${u.bank} BIGPAY** in your bank.`, ephemeral: true });
    }
    const channel = await interaction.guild.channels.create({
      name: `withdraw-${user.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
      ]
    });
    u.pending = amount;
    saveDB();
    await channel.send(`💳 **Withdrawal Request**\n👤 User: <@${user.id}>\n💰 Amount: **${amount} BIGPAY**\n\nAn admin can use \`/close\` to complete and close this ticket.`);
    return interaction.reply({ content: `✅ Withdrawal ticket created: ${channel}`, ephemeral: true });
  }

  // /close
  if (name === "close") {
    const channel = interaction.channel;
    const userId = channel.name.split("-")[1];
    if (!userId || !db.users[userId]) {
      return interaction.reply({ content: "❌ This does not appear to be a withdrawal channel.", ephemeral: true });
    }
    const u = getUser(userId);
    const amount = u.pending || 0;
    u.bank -= amount;
    u.pending = 0;
    saveDB();
    await interaction.reply(`✅ **${amount} BIGPAY** withdrawal completed. Closing ticket in 3 seconds...`);
    setTimeout(() => channel.delete().catch(() => {}), 3000);
  }

  // /qr
  if (name === "qr") {
    const upiId = interaction.options.getString("upi_id");
    const amount = interaction.options.getNumber("amount");
    const upiUrl = `upi://pay?pa=${upiId}&am=${amount}&cu=INR`;
    try {
      await interaction.deferReply();
      const buffer = await QRCode.toBuffer(upiUrl, { width: 400, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" } });
      const attachment = new AttachmentBuilder(buffer, { name: "upi-qr.png" });
      return interaction.editReply({
        content: `📱 **UPI Payment QR Code**\n\n💳 **UPI ID:** \`${upiId}\`\n💰 **Amount:** ₹${amount}\n\n_Scan with any UPI app to pay directly._`,
        files: [attachment]
      });
    } catch (err) {
      console.error("QR Error:", err);
      return interaction.editReply({ content: "❌ Failed to generate QR code. Please try again." });
    }
  }
});

process.on("uncaughtException", err => console.error("UNCAUGHT ERROR:", err));
process.on("unhandledRejection", err => console.error("UNHANDLED REJECTION:", err));

// Keep-alive server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("BIG DEAL Bot is alive! 🔥");
});
server.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Keep-alive server running`);
});

client.login(process.env.TOKEN);
