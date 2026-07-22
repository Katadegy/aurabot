// ==========================================
// 0. .env DATEI LADEN (muss ganz oben stehen!)
// ==========================================
require('dotenv').config();

// ==========================================
// 1. IMPORT-BEFEHLE (Discord & Server Tools)
// ==========================================
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ActivityType
} = require('discord.js');

const fs   = require('fs');
const path = require('path');

// ==========================================
// PERSISTENTE SPEICHERUNG (übersteht Neustarts)
// ==========================================
const STORAGE_FILE = path.join(__dirname, 'bot-data.json');

function loadStorage() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { rulesMessageId: null, setupMessageIds: {}, twitchWasLive: null };
  }
}

function saveStorage() {
  try {
    fs.writeFileSync(
        STORAGE_FILE,
        JSON.stringify({ rulesMessageId, setupMessageIds, twitchWasLive }, null, 2)
    );
  } catch (e) {
    console.error('Konnte bot-data.json nicht speichern:', e);
  }
}

// ==========================================
// 2. EXPRESS WEBSERVER (Für cron-job.org)
// ==========================================
app.get('/', (req, res) => res.send('Bot ist wach und läuft!'));
app.listen(port, () => console.log(`Webserver läuft auf Port ${port}`));

// ==========================================
// 3. DISCORD BOT ERSTELLEN
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

// ==========================================
// SERVER-KONFIGURATION
// ── IDs & Texte hier eintragen ───────────
// ==========================================
const SERVER_NAME = "Auralune's community";

// Rolle, die man nach Regel-Bestätigung bekommt ("Zuschauer")
const VERIFIED_ROLE_ID = "1504963421345419352";

// Kanäle
const WELCOME_CHANNEL_ID = "1504963423241240636";  // Willkommensnachricht
const RULES_CHANNEL_ID   = "1504963422733734008";  // Regeln
const ROLES_CHANNEL_ID   = "1504998862132084807";  // Rollenauswahl
const MAINCHAT_CHANNEL_ID = "1504963423241240642"; // Haupt-Chat
const STREAM_ALERT_CHANNEL_ID = "1504963423681773572"; // Stream-Ankündigungen

// Rolle, die bei einer Live-Ankündigung gepingt wird
const STREAM_ALERTS_ROLE_ID = "1507128739895578676";

// Twitch-Kanal
const TWITCH_USER_LOGIN = "Auralune1__";
const TWITCH_CHANNEL_URL = `https://www.twitch.tv/${TWITCH_USER_LOGIN}`;

// Wie oft (in ms) geprüft wird, ob der Stream live ist
const TWITCH_POLL_INTERVAL_MS = 60 * 1000; // 1 Minute

// ── Bild-URLs ─────────────────────────────
const WELCOME_BANNER_URL = "https://i.imgur.com/ou9vHWx.png";
const ROLES_OVERVIEW_IMAGE_URL = "https://i.imgur.com/nJh62io.gif";
const ROLES_THUMBNAIL_URL = "https://i.imgur.com/oeyctCl.gif";

// Hintergrundbilder unten in den Kategorie-Embeds
const categoryImages = {
  cat_pronouns:      "",
  cat_platforms:     "",
  cat_genres:        "",
  cat_aura:          "",
  cat_notifications: ""
};

// ── Farben ────────────────────────────────
const SERVER_COLOR = '#D6559C';
const GROUP_COLORS = {
  pronouns:      '#F2A9D0',
  platforms:     '#5865F2',
  genres:        '#43B581',
  aura:          '#B9A7E8',
  notifications: '#ED4245'
};

let rulesMessageId = null;
let twitchWasLive = null;

// Merkt sich Test-Nachrichten pro Kanal
// Format: { [channelId]: { [catKey]: messageId } }
const testMessageIds = {};

// ==========================================
// 4. ROLLEN-KATEGORIEN
// ==========================================
const categories = {
  cat_pronouns: {
    label: '🏳️‍🌈 Pronomen',
    description: 'Zeig anderen, wie sie dich ansprechen können.',
    group: 'pronouns',
    roles: [
      { name: 'He/Him',    emoji: '💙', desc: 'Wird mit er/ihm angesprochen.' },
      { name: 'She/Her',   emoji: '💗', desc: 'Wird mit sie/ihr angesprochen.' },
      { name: 'They/Them', emoji: '💜', desc: 'Wird mit they/them angesprochen.' }
    ]
  },
  cat_platforms: {
    label: '🎮 Plattformen',
    description: 'Auf welcher Plattform zockst du am liebsten?',
    group: 'platforms',
    roles: [
      { name: 'PC',          emoji: '🖥️', desc: 'Zockt am PC.' },
      { name: 'Xbox',        emoji: '🎮', desc: 'Zockt auf der Xbox.' },
      { name: 'PlayStation', emoji: '🕹️', desc: 'Zockt auf der PlayStation.' },
      { name: 'Switch',      emoji: '🔴', desc: 'Zockt auf der Nintendo Switch.' },
      { name: 'Mobile',      emoji: '📱', desc: 'Zockt mobil.' }
    ]
  },
  cat_genres: {
    label: '🕹️ Game Genres',
    description: 'Welche Spiele-Genres ziehen dich rein?',
    group: 'genres',
    roles: [
      { name: 'Horror',       emoji: '👻', desc: 'Steht auf gruselige Spiele.' },
      { name: 'Simulationen', emoji: '🏗️', desc: 'Liebt Simulationen & Aufbauspiele.' },
      { name: 'Shooter',      emoji: '🔫', desc: 'Steht auf Shooter.' },
      { name: 'Action',       emoji: '💥', desc: 'Steht auf Action-Spiele.' }
    ]
  },
  cat_aura: {
    label: '🌸 Deine Aura',
    description: 'Was beschreibt dich am besten? Wähle die Rolle die zu deiner Energie passt.',
    group: 'aura',
    roles: [
      { name: 'Nachteule',   emoji: '🌙', desc: 'Du lebst nachts auf. Beste Streams um Mitternacht.' },
      { name: 'Sakura Vibe', emoji: '🌸', desc: 'Entspannt, ästhetisch und einfach nice.' },
      { name: 'Hype Train',  emoji: '⚡', desc: 'Voller Energie, laut und immer dabei.' },
      { name: 'Tryhard',     emoji: '🎯', desc: 'Alles oder nichts. Du gibst immer 100%.' },
      { name: 'Chill Mode',  emoji: '🎒', desc: 'Entspannt. Keinen Stress. Einfach da.' }
    ]
  },
  cat_notifications: {
    label: '🔔 Benachrichtigungen',
    description: 'Entscheide welche Pings du auf diesem Server erhalten möchtest.',
    group: 'notifications',
    roles: [
      {
        name: 'Stream Alerts', emoji: '🔴',
        desc: 'Verpasse keinen Stream. Du wirst sofort benachrichtigt wenn Auralune auf Twitch live geht.',
        id: STREAM_ALERTS_ROLE_ID
      }
    ]
  }
};

// Emoji, mit dem die Regeln bestätigt werden
const RULES_EMOJI = '✅';

let setupMessageIds = {
  welcome:            "",
  cat_pronouns:       "",
  cat_platforms:      "",
  cat_genres:         "",
  cat_aura:           "",
  cat_notifications:  ""
};

// Gespeicherte Werte laden
{
  const saved = loadStorage();
  if (saved.rulesMessageId) rulesMessageId = saved.rulesMessageId;
  if (saved.setupMessageIds) setupMessageIds = { ...setupMessageIds, ...saved.setupMessageIds };
  if (typeof saved.twitchWasLive === 'boolean') twitchWasLive = saved.twitchWasLive;
}

// ==========================================
// 4a. LOCK-MECHANISMUS
// ==========================================
const processingLocks = new Map();

async function withLock(key, fn) {
  while (processingLocks.has(key)) {
    await processingLocks.get(key).catch(() => {});
  }
  let releaseLock;
  const lockPromise = new Promise((resolve) => { releaseLock = resolve; });
  processingLocks.set(key, lockPromise);
  try {
    return await fn();
  } finally {
    processingLocks.delete(key);
    releaseLock();
  }
}

// ==========================================
// 4b. HILFSFUNKTIONEN
// ==========================================

// Entfernt Emojis + normalisiert für Rollenname-Vergleich
function normalizeRoleName(str) {
  return str
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
}

// Findet die echte Discord-Rolle per exaktem Namensvergleich (nach Emoji-Strip)
function findRoleByName(guild, name) {
  const target = normalizeRoleName(name);
  return guild.roles.cache.find((ro) => normalizeRoleName(ro.name) === target) || null;
}

// Löst eine Rollen-Definition zur echten Discord-Rolle auf.
// FIX: Loggt wenn eine Rolle nicht gefunden wird, um Namens-Mismatches zu erkennen.
function resolveRole(guild, roleDef) {
  if (roleDef.id) {
    const role = guild.roles.cache.get(roleDef.id);
    if (!role) console.error(`[ROLES] Rolle per ID nicht gefunden: ${roleDef.id} ("${roleDef.name}") — prüfe ob die ID noch stimmt.`);
    return role || null;
  }
  const role = findRoleByName(guild, roleDef.name);
  if (!role) console.error(`[ROLES] Rolle per Name nicht gefunden: "${roleDef.name}" — prüfe ob der Rollenname auf Discord exakt so heißt (nach Emoji-Strip).`);
  return role;
}

// Wandelt ein im Code hinterlegtes Emoji in das Format um, das message.react() erwartet.
function emojiForReact(emojiStr) {
  const match = emojiStr.match(/^<(a)?:(\w+):(\d+)>$/);
  if (match) return `${match[2]}:${match[3]}`;
  return emojiStr;
}

// FIX: Variation-Selector \uFE0F wird von Discord bei Reactions entfernt.
// Emojis wie 🖥️, 🕹️, 🏗️ enthalten \uFE0F im Code aber NICHT in der Reaction.
// Beide Seiten werden jetzt vor dem Vergleich bereinigt.
function emojiMatches(reactionEmoji, defEmojiStr) {
  const custom = defEmojiStr.match(/^<(a)?:(\w+):(\d+)>$/);
  if (custom) return reactionEmoji.id === custom[3];
  const strip = (s) => (s || '').replace(/\uFE0F/g, '');
  return strip(reactionEmoji.name) === strip(defEmojiStr);
}

// Durchsucht Channel-Verlauf nach bestehendem Bot-Embed (Fallback nach Neustart)
async function findExistingBotEmbed(channel, title) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    return messages.find(
        (m) => m.author.id === channel.client.user.id &&
            m.embeds.length > 0 &&
            m.embeds[0].title === title
    ) || null;
  } catch (e) {
    console.error('Konnte Channel-Verlauf nicht durchsuchen:', e);
    return null;
  }
}

// Entfernt alle bisherigen Reactions einer Nachricht und setzt neue.
async function syncReactions(message, emojiList) {
  try {
    await message.reactions.removeAll();
  } catch (e) {
    console.error('Konnte alte Reactions nicht entfernen:', e);
  }
  for (const emoji of emojiList) {
    try {
      await message.react(emojiForReact(emoji));
    } catch (e) {
      console.error(`Konnte Reaction "${emoji}" nicht hinzufügen:`, e);
    }
  }
}

// Baut das Welcome-Embed für einen neuen Member
function buildWelcomeEmbed(member) {
  const guild       = member.guild;
  const memberCount = guild.memberCount;
  const avatarUrl   = member.user.displayAvatarURL({ size: 256 });
  const createdUnix = Math.floor(member.user.createdTimestamp / 1000);

  return new EmbedBuilder()
      .setAuthor({ name: `${SERVER_NAME} · Neues Mitglied` })
      .setTitle(`🌸 Willkommen ${member.displayName}! 🌸`)
      .setColor(SERVER_COLOR)
      .setDescription(
          `Hey <@${member.id}>, herzlich willkommen auf **${SERVER_NAME}**! Wir freuen uns riesig, dass du hier bist 💜\n\n` +
          `**Als nächstes:**\n` +
          `→ Lies die <#${RULES_CHANNEL_ID}> durch\n` +
          `→ Wähle deine Rollen in <#${ROLES_CHANNEL_ID}>\n` +
          `→ Stell dich gerne in <#${MAINCHAT_CHANNEL_ID}> vor\n\n` +
          `Viel Spaß beim Chatten und Zocken!\n` +
          `Jetzt bist du offiziell Teil der Family! 💌`
      )
      .addFields(
          { name: '👤 Mitglied Nr.', value: `#${memberCount}`, inline: true },
          { name: '📅 Account seit', value: `<t:${createdUnix}:R>`, inline: true }
      )
      .setThumbnail(avatarUrl)
      .setImage(WELCOME_BANNER_URL)
      .setFooter({ text: `${SERVER_NAME}` })
      .setTimestamp();
}

// ==========================================
// BAUT DAS EMBED FÜR EINE ROLLEN-KATEGORIE
// FIX: guild.roles.fetch() muss VOR dem Aufruf dieser Funktion gemacht werden
// damit der Cache aktuell ist und <@&ID> korrekt rendert.
// ==========================================
function buildCategoryEmbed(catKey, cat, guild, index, total) {
  const color = GROUP_COLORS[cat.group] || SERVER_COLOR;

  const embed = new EmbedBuilder()
      .setAuthor({ name: `${SERVER_NAME} · Kategorie ${index} / ${total}` })
      .setTitle(cat.label)
      .setColor(color)
      .setDescription(`*${cat.description}*`)
      .setFooter({ text: `AuraBot · Reagiere mit einem Emoji um die Rolle zu erhalten oder zu entfernen` });

  if (ROLES_THUMBNAIL_URL) embed.setThumbnail(ROLES_THUMBNAIL_URL);
  if (categoryImages[catKey]) embed.setImage(categoryImages[catKey]);

  for (const r of cat.roles) {
    const role  = resolveRole(guild, r);
    const tag   = role ? `<@&${role.id}>` : `**${r.name}**`;
    const value = r.desc ? `${tag}\n${r.desc}` : tag;
    embed.addFields({ name: r.emoji, value, inline: true });
  }

  return embed;
}

// ==========================================
// TWITCH – AUTOMATISCHE LIVE-ERKENNUNG
// ==========================================
let twitchAppToken = null;

async function getTwitchAppToken() {
  if (twitchAppToken && Date.now() < twitchAppToken.expiresAt - 60000) {
    return twitchAppToken.token;
  }
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch Token Fehler: ${res.status}`);
  const data = await res.json();
  twitchAppToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return twitchAppToken.token;
}

async function fetchCurrentStream() {
  const token = await getTwitchAppToken();
  const res = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(TWITCH_USER_LOGIN)}`,
      {
        headers: {
          'Client-Id': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`
        }
      }
  );
  if (!res.ok) throw new Error(`Twitch API Fehler: ${res.status}`);
  const data = await res.json();
  return (data.data && data.data.length > 0) ? data.data[0] : null;
}

function buildStreamEmbed(stream) {
  let thumbnail = null;
  if (stream.thumbnail_url) {
    thumbnail = stream.thumbnail_url
        .replace('{width}', '640')
        .replace('{height}', '360') + `?t=${Date.now()}`;
  }

  const embed = new EmbedBuilder()
      .setColor('#9146FF')
      .setAuthor({ name: `${TWITCH_USER_LOGIN} ist jetzt live!` })
      .setTitle(stream.title || 'Live auf Twitch')
      .setURL(TWITCH_CHANNEL_URL)
      .addFields(
          { name: '🎮 Spiel', value: stream.game_name || 'Unbekannt', inline: true },
          { name: '👁️ Zuschauer', value: `${stream.viewer_count ?? 0}`, inline: true }
      )
      .setFooter({ text: `${SERVER_NAME} · Live-Ankündigung` })
      .setTimestamp();

  if (thumbnail) embed.setImage(thumbnail);
  return embed;
}

async function announceStreamLive(stream) {
  const channel = client.channels.cache.get(STREAM_ALERT_CHANNEL_ID);
  if (!channel) {
    console.error(`[TWITCH] Stream-Alert-Kanal ${STREAM_ALERT_CHANNEL_ID} nicht gefunden!`);
    return;
  }

  const embed = buildStreamEmbed(stream);
  const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
          .setLabel('Jetzt zuschauen')
          .setEmoji('🔴')
          .setStyle(ButtonStyle.Link)
          .setURL(TWITCH_CHANNEL_URL)
  );

  const alertRole = channel.guild.roles.cache.get(STREAM_ALERTS_ROLE_ID);
  if (!alertRole) {
    console.error(`[TWITCH] Stream-Alerts-Rolle ${STREAM_ALERTS_ROLE_ID} nicht gefunden!`);
  }
  const pingContent = alertRole ? `<@&${STREAM_ALERTS_ROLE_ID}>` : '';

  await channel.send({
    content: pingContent,
    embeds: [embed],
    components: [row]
  });
  console.log(`[TWITCH] Live-Ankündigung für ${TWITCH_USER_LOGIN} gesendet.`);
}

async function checkTwitchStream() {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    return;
  }

  try {
    const stream = await fetchCurrentStream();
    const isLive = !!stream;

    if (twitchWasLive === null) {
      twitchWasLive = isLive;
      saveStorage();
      return;
    }

    if (isLive && !twitchWasLive) {
      await announceStreamLive(stream);
    }

    twitchWasLive = isLive;
    saveStorage();
  } catch (e) {
    console.error('[TWITCH] Fehler beim Live-Check:', e);
  }
}

// ==========================================
// 5. NACHRICHTEN-BEFEHLE
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has('Administrator')) return;

  // ─────────────────────────────────────────
  // !setup-rules
  // ─────────────────────────────────────────
  if (message.content === '!setup-rules') {
    const file = new AttachmentBuilder('./Regeln.png');

    const rulesEmbed = new EmbedBuilder()
        .setTitle('🌸 LAURAS COMMUNITY SERVER REGELN 🌸')
        .setDescription(
            '>>> Herzlich willkommen!\n' +
            'Damit sich alle hier wohlfühlen und wir eine coole, respektvolle Community bleiben, bitten wir dich, diese Regeln zu beachten.\n\u200b'
        )
        .addFields(
            { name: '💜  Respekt & Umgangston', value: 'Sei freundlich und respektvoll zu allen Mitgliedern.\nKein Hate, keine Beleidigungen, Rassismus, Sexismus, Homophobie oder Mobbing.\nDiskussionen sind erlaubt – aber immer fair und höflich.' },
            { name: '🚫  Kein Spam & Werbung', value: 'Keine unnötigen Nachrichten, Emoji-Spam oder wiederholte Posts.\nEigenwerbung (eigener Stream, YouTube, Server etc.) ist verboten, außer mit ausdrücklicher Erlaubnis der Moderatoren.' },
            { name: '✨  Spoiler & Backseat-Gaming', value: 'Keine Spoiler zu laufenden Spielen oder Serien.\nBackseat-Gaming (ungefragte Tipps) ist nicht erlaubt – außer Laura fragt aktiv danach.' },
            { name: '🗣️  Chat & Voice Verhalten', value: 'Bleib im Chat und in Voice-Channels freundlich und entspannt.\nKein lautes Schreien, Stören oder Toxic-Verhalten in Voice.\nNSFW-Inhalte (Bilder, Links, Gespräche) sind nicht erlaubt.' },
            { name: '👑  Moderatoren & Regeln', value: 'Die Moderatoren haben das letzte Wort.\nBei Streitigkeiten oder Unklarheiten: einfach die Mods anschreiben.\nWer die Regeln wiederholt missachtet, wird gemutet oder vom Server entfernt.' }
        )
        .setColor(SERVER_COLOR)
        .setImage('attachment://Regeln.png')
        .setFooter({ text: `${SERVER_NAME} · Reagiere mit ${RULES_EMOJI} um alle Regeln zu akzeptieren.` });

    if (!rulesMessageId) {
      const existing = await findExistingBotEmbed(message.channel, '🌸 LAURAS COMMUNITY SERVER REGELN 🌸');
      if (existing) rulesMessageId = existing.id;
    }

    let rulesMsg = null;

    if (rulesMessageId) {
      try {
        rulesMsg = await message.channel.messages.fetch(rulesMessageId);
        await rulesMsg.edit({ embeds: [rulesEmbed], files: [file], components: [] });
        const reply = await message.reply('Regeln erfolgreich aktualisiert! 🔄');
        setTimeout(() => reply.delete().catch(() => {}), 3000);
      } catch (e) {
        console.error('Konnte alte Regeln-Nachricht nicht editieren, poste neu:', e);
        rulesMessageId = null;
        rulesMsg = null;
      }
    }

    if (!rulesMessageId) {
      rulesMsg = await message.channel.send({ embeds: [rulesEmbed], files: [file], components: [] });
      rulesMessageId = rulesMsg.id;
    }

    await syncReactions(rulesMsg, [RULES_EMOJI]);

    saveStorage();
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !test-roles
  // FIX: guild.roles.fetch() stellt sicher dass alle Rollen im Cache sind,
  // damit <@&ID> im Embed korrekt als Rollenname gerendert wird.
  // ─────────────────────────────────────────
  if (message.content === '!test-roles') {
    // Rollen-Cache aktualisieren BEVOR Embeds gebaut werden
    await message.guild.roles.fetch();

    const catKeys = Object.keys(categories);
    const total = catKeys.length;
    const channelId = message.channel.id;

    if (!testMessageIds[channelId]) testMessageIds[channelId] = {};
    const channelTestIds = testMessageIds[channelId];

    // ── Deckblatt ──
    const welcomeDesc =
        '**Gestalte deinen Auftritt auf dem Server ganz nach deinen Wünschen.**\n\n' +
        'Scrolle durch die Kategorien unten und reagiere mit dem passenden Emoji um dir Rollen auszusuchen. Reaction wieder entfernen = Rolle wieder entfernen.\n\n' +
        '🏳️‍🌈 **Pronomen** — Zeig anderen wie sie dich ansprechen können\n' +
        '🎮 **Plattformen** — Auf welcher Plattform zockst du?\n' +
        '🕹️ **Game Genres** — Welche Spiele-Genres magst du?\n' +
        '🌸 **Deine Aura** — Zeig wer du bist\n' +
        '🔔 **Benachrichtigungen** — Bestimme welche Pings du bekommst\n\n' +
        '*Alle Rollen sind optional und jederzeit änderbar.*';

    const welcomeEmbed = new EmbedBuilder()
        .setAuthor({ name: `${SERVER_NAME} · Rollen-Auswahl` })
        .setTitle('🌙 Willkommen im Rollen-Channel')
        .setDescription(welcomeDesc)
        .setColor(SERVER_COLOR)
        .setImage(WELCOME_BANNER_URL)
        .setFooter({ text: SERVER_NAME })
        .setTimestamp();

    if (ROLES_THUMBNAIL_URL) welcomeEmbed.setThumbnail(ROLES_THUMBNAIL_URL);

    if (channelTestIds.welcome) {
      try {
        const msg = await message.channel.messages.fetch(channelTestIds.welcome);
        await msg.edit({ embeds: [welcomeEmbed] });
      } catch (e) {
        const sent = await message.channel.send({ embeds: [welcomeEmbed] });
        channelTestIds.welcome = sent.id;
      }
    } else {
      const sent = await message.channel.send({ embeds: [welcomeEmbed] });
      channelTestIds.welcome = sent.id;
    }

    // ── Kategorien ──
    for (let i = 0; i < catKeys.length; i++) {
      const key = catKeys[i];
      const cat = categories[key];
      const embed = buildCategoryEmbed(key, cat, message.guild, i + 1, total);
      const emojiList = cat.roles.map((r) => r.emoji);

      let sentMsg;
      if (channelTestIds[key]) {
        try {
          sentMsg = await message.channel.messages.fetch(channelTestIds[key]);
          await sentMsg.edit({ embeds: [embed] });
        } catch (e) {
          sentMsg = await message.channel.send({ embeds: [embed] });
          channelTestIds[key] = sentMsg.id;
        }
      } else {
        sentMsg = await message.channel.send({ embeds: [embed] });
        channelTestIds[key] = sentMsg.id;
      }

      await syncReactions(sentMsg, emojiList);
    }

    const reply = await message.reply('Test-Embeds aktualisiert (nur hier, nicht im echten Rollen-Channel gespeichert). Reactions funktionieren zum Testen ganz normal.');
    setTimeout(() => reply.delete().catch(() => {}), 6000);
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !test-roles-clear
  // ─────────────────────────────────────────
  if (message.content === '!test-roles-clear') {
    const channelId = message.channel.id;
    const channelTestIds = testMessageIds[channelId] || {};
    let deletedCount = 0;

    for (const key of Object.keys(channelTestIds)) {
      try {
        const msg = await message.channel.messages.fetch(channelTestIds[key]);
        await msg.delete();
        deletedCount++;
      } catch (e) { /* schon gelöscht */ }
    }
    testMessageIds[channelId] = {};

    const reply = await message.reply(`${deletedCount} Test-Embed(s) hier gelöscht.`);
    setTimeout(() => reply.delete().catch(() => {}), 4000);
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !setup-roles
  // FIX: guild.roles.fetch() vor dem Embed-Aufbau
  // ─────────────────────────────────────────
  if (message.content === '!setup-roles') {
    // Rollen-Cache aktualisieren BEVOR Embeds gebaut werden
    await message.guild.roles.fetch();

    const catKeys = Object.keys(categories);
    const total = catKeys.length;

    // ── Deckblatt senden / aktualisieren ──
    const welcomeDesc =
        '**Gestalte deinen Auftritt auf dem Server ganz nach deinen Wünschen.**\n\n' +
        'Scrolle durch die Kategorien unten und reagiere mit dem passenden Emoji um dir Rollen auszusuchen. Reaction wieder entfernen = Rolle wieder entfernen.\n\n' +
        '🏳️‍🌈 **Pronomen** — Zeig anderen wie sie dich ansprechen können\n' +
        '🎮 **Plattformen** — Auf welcher Plattform zockst du?\n' +
        '🕹️ **Game Genres** — Welche Spiele-Genres magst du?\n' +
        '🌸 **Deine Aura** — Zeig wer du bist\n' +
        '🔔 **Benachrichtigungen** — Bestimme welche Pings du bekommst\n\n' +
        '*Alle Rollen sind optional und jederzeit änderbar.*';

    const welcomeEmbed = new EmbedBuilder()
        .setAuthor({ name: `${SERVER_NAME} · Rollen-Auswahl` })
        .setTitle('🌙 Willkommen im Rollen-Channel')
        .setDescription(welcomeDesc)
        .setColor(SERVER_COLOR)
        .setImage(WELCOME_BANNER_URL)
        .setFooter({ text: SERVER_NAME })
        .setTimestamp();

    if (ROLES_THUMBNAIL_URL) welcomeEmbed.setThumbnail(ROLES_THUMBNAIL_URL);

    if (setupMessageIds.welcome) {
      try {
        const msg = await message.channel.messages.fetch(setupMessageIds.welcome);
        await msg.edit({ embeds: [welcomeEmbed] });
      } catch (e) {
        const sent = await message.channel.send({ embeds: [welcomeEmbed] });
        setupMessageIds.welcome = sent.id;
      }
    } else {
      const sent = await message.channel.send({ embeds: [welcomeEmbed] });
      setupMessageIds.welcome = sent.id;
    }

    // ── Kategorien senden / aktualisieren ──
    for (let i = 0; i < catKeys.length; i++) {
      const key = catKeys[i];
      const cat = categories[key];
      const embed = buildCategoryEmbed(key, cat, message.guild, i + 1, total);
      const emojiList = cat.roles.map((r) => r.emoji);

      let sentMsg;
      if (setupMessageIds[key]) {
        try {
          sentMsg = await message.channel.messages.fetch(setupMessageIds[key]);
          await sentMsg.edit({ embeds: [embed] });
        } catch (e) {
          console.error(`Konnte Embed "${key}" nicht editieren, poste neu:`, e);
          sentMsg = await message.channel.send({ embeds: [embed] });
          setupMessageIds[key] = sentMsg.id;
        }
      } else {
        sentMsg = await message.channel.send({ embeds: [embed] });
        setupMessageIds[key] = sentMsg.id;
      }

      await syncReactions(sentMsg, emojiList);
    }

    saveStorage();
    const reply = await message.reply('Alle Embeds aktualisiert! ✅');
    setTimeout(() => reply.delete().catch(() => {}), 4000);
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !update-roles
  // FIX: guild.roles.fetch() vor dem Embed-Aufbau
  // ─────────────────────────────────────────
  if (message.content === '!update-roles') {
    await message.guild.roles.fetch();

    const catKeys = Object.keys(categories);
    const total = catKeys.length;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < catKeys.length; i++) {
      const key = catKeys[i];
      const cat = categories[key];
      const msgId = setupMessageIds[key];
      if (!msgId) { skipped++; continue; }

      let sentMsg;
      try {
        sentMsg = await message.channel.messages.fetch(msgId);
      } catch (e) {
        skipped++;
        continue;
      }

      const embed = buildCategoryEmbed(key, cat, message.guild, i + 1, total);
      const emojiList = cat.roles.map((r) => r.emoji);
      await sentMsg.edit({ embeds: [embed] });
      await syncReactions(sentMsg, emojiList);
      updated++;
    }

    const reply = await message.reply(`${updated} Embed(s) aktualisiert, ${skipped} übersprungen.`);
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !delete-roles
  // ─────────────────────────────────────────
  if (message.content === '!delete-roles') {
    const idsToDelete = Object.entries(setupMessageIds).filter(([, id]) => id);
    let deletedCount = 0;

    for (const [key, id] of idsToDelete) {
      try {
        const msg = await message.channel.messages.fetch(id);
        await msg.delete();
        deletedCount++;
      } catch (e) { /* schon gelöscht */ }
      setupMessageIds[key] = "";
    }

    saveStorage();
    const reply = await message.reply(
        `${deletedCount} Embed(s) gelöscht. Nutze \`!setup-roles\` um alles neu zu posten.`
    );
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !test-welcome
  // ─────────────────────────────────────────
  if (message.content === '!test-welcome') {
    const embed = buildWelcomeEmbed(message.member);
    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});
  }

  // ─────────────────────────────────────────
  // !test-stream [Titel]
  // ─────────────────────────────────────────
  if (message.content.startsWith('!test-stream')) {
    const title = message.content.slice('!test-stream'.length).trim() || 'Test-Stream';

    const fakeStream = {
      title,
      game_name: 'Fortnite',
      viewer_count: 0,
      thumbnail_url: ''
    };

    await announceStreamLive(fakeStream);
    await message.delete().catch(() => {});
  }
});

// ==========================================
// 6. REACTION-INTERAKTIONEN (Regeln + Rollen)
// ==========================================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (e) {
    console.error('Konnte partielle Reaction/Nachricht nicht laden:', e);
    return;
  }

  const message = reaction.message;
  if (!message.guild) return;

  // ── Regeln akzeptieren ──
  if (message.id === rulesMessageId && emojiMatches(reaction.emoji, RULES_EMOJI)) {
    const guild = message.guild;
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) {
      console.error('[VERIFY] Rolle nicht gefunden!');
      return;
    }
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (member.roles.cache.has(VERIFIED_ROLE_ID)) return;

    try {
      await member.roles.add(role);
    } catch (e) {
      console.error(`[VERIFY] Fehler bei ${user.tag}:`, e.code, e.message);
    }
    return;
  }

  // ── Rollen-Kategorien ──
  // FIX: Sucht zuerst in setupMessageIds, dann in testMessageIds aller Kanäle.
  // Dadurch funktionieren Reactions auch bei !test-roles-Nachrichten.
  let catKey = Object.keys(setupMessageIds).find((k) => k !== 'welcome' && setupMessageIds[k] === message.id);

  if (!catKey) {
    for (const channelTestIds of Object.values(testMessageIds)) {
      catKey = Object.keys(channelTestIds).find((k) => k !== 'welcome' && channelTestIds[k] === message.id);
      if (catKey) break;
    }
  }

  if (!catKey) return;

  const category = categories[catKey];
  if (!category) return;

  const roleDef = category.roles.find((r) => emojiMatches(reaction.emoji, r.emoji));
  if (!roleDef) return;

  const lockKey = `${message.id}:${user.id}`;
  await withLock(lockKey, async () => {
    const guild = message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = resolveRole(guild, roleDef);
    if (!role) {
      console.error(`[ROLES] Rolle "${roleDef.name}" existiert nicht auf dem Server.`);
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role).catch((e) => console.error('Konnte Rolle nicht hinzufügen:', e));
    }
  });
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (e) {
    console.error('Konnte partielle Reaction/Nachricht nicht laden:', e);
    return;
  }

  const message = reaction.message;
  if (!message.guild) return;

  // Regeln-Reaction wird bewusst NICHT rückgängig gemacht

  // ── Rollen-Kategorien ──
  // FIX: Sucht zuerst in setupMessageIds, dann in testMessageIds aller Kanäle.
  let catKey = Object.keys(setupMessageIds).find((k) => k !== 'welcome' && setupMessageIds[k] === message.id);

  if (!catKey) {
    for (const channelTestIds of Object.values(testMessageIds)) {
      catKey = Object.keys(channelTestIds).find((k) => k !== 'welcome' && channelTestIds[k] === message.id);
      if (catKey) break;
    }
  }

  if (!catKey) return;

  const category = categories[catKey];
  if (!category) return;

  const roleDef = category.roles.find((r) => emojiMatches(reaction.emoji, r.emoji));
  if (!roleDef) return;

  const lockKey = `${message.id}:${user.id}`;
  await withLock(lockKey, async () => {
    const guild = message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = resolveRole(guild, roleDef);
    if (!role) return;

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role).catch((e) => console.error('Konnte Rolle nicht entfernen:', e));
    }
  });
});

// ==========================================
// 6b. WELCOME-NACHRICHT (automatisch bei Join)
// ==========================================
client.on('guildMemberAdd', async (member) => {
  try {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) {
      console.error(`[WELCOME] Kanal ${WELCOME_CHANNEL_ID} nicht gefunden!`);
      return;
    }
    const embed = buildWelcomeEmbed(member);
    await channel.send({ embeds: [embed] });
    console.log(`[WELCOME] Willkommensnachricht für ${member.user.tag} gesendet.`);
  } catch (e) {
    console.error('[WELCOME] Fehler bei guildMemberAdd:', e);
  }
});

// ==========================================
// 7. BOT-START
// ==========================================
client.once('ready', () => {
  console.log(`${SERVER_NAME} Bot online als ${client.user.tag}`);
  client.user.setActivity(`Schaut Auralune auf Twitch zu`, {
    type: ActivityType.Streaming,
    url: TWITCH_CHANNEL_URL
  });

  checkTwitchStream();
  setInterval(checkTwitchStream, TWITCH_POLL_INTERVAL_MS);
});

client.on('error', (e) => console.error('[CLIENT ERROR]', e));
client.on('shardError', (e) => console.error('[SHARD ERROR]', e));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED REJECTION]', e));

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('[LOGIN FEHLER]', e);
});
