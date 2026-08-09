// بوت تيليجرام لتحميل فيديوهات تيك توك - نسخة Node.js (JavaScript)
//
// المتطلبات قبل التشغيل:
//   1) تثبيت Node.js (يفضل نسخة 18 أو أحدث)
//   2) تثبيت الحزم التالية عبر npm:
//        npm install node-telegram-bot-api
//   3) تثبيت أداة yt-dlp على الجهاز (ليست حزمة npm، بل برنامج مستقل):
//        - على لينكس/ماك: pip install yt-dlp   أو   brew install yt-dlp
//        - على ويندوز: حمّلها من https://github.com/yt-dlp/yt-dlp/releases
//      يجب أن يكون أمر "yt-dlp" متاحًا في PATH حتى يشتغل الكود.
//
// التشغيل:
//        node بوت_تحميل_من_تيك_توك.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const TelegramBot = require("node-telegram-bot-api");

// =============================
//  ضع توكن البوت هنا (من BotFather)
// =============================
const BOT_TOKEN = "8473267630:AAFt02-QzJub4PvlgNKLuQ3EsSkBbJJ-aks";

const TIKTOK_URL_PATTERN = /(https?:\/\/)?(www\.|vm\.|vt\.|m\.)?tiktok\.com\/\S+/i;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

if (!BOT_TOKEN || BOT_TOKEN === "8473267630:AAFt02-QzJub4PvlgNKLuQ3EsSkBbJJ-aks") {
  console.log("8473267630:AAFt02-QzJub4PvlgNKLuQ3EsSkBbJJ-aks");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log("البوت يعمل الآن...");

// أمر /start
bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "أهلاً! أرسل لي رابط فيديو من تيك توك وسأقوم بتحميله لك بجودة عالية بدون علامة مائية."
  );
});

/**
 * يحمّل فيديو تيك توك بأعلى جودة متاحة باستخدام yt-dlp
 * ويرجع (عبر Promise) مسار ملف mp4 الناتج.
 */
function downloadTikTok(url, outDir) {
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(outDir, "%(id)s.%(ext)s");

    const args = [
      url,
      "-o",
      outputTemplate,
      "-f",
      "bestvideo+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "--quiet",
      "--no-warnings",
      "--no-playlist",
      "--user-agent",
      USER_AGENT,
      "--print",
      "after_move:filepath",
    ];

    execFile("yt-dlp", args, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      const printedPath = stdout.trim().split("\n").pop();
      if (printedPath && fs.existsSync(printedPath)) {
        resolve(printedPath);
        return;
      }

      // احتياطياً: ابحث عن أي ملف mp4 داخل مجلد التحميل المؤقت
      const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".mp4"));
      if (files.length > 0) {
        resolve(path.join(outDir, files[0]));
      } else {
        reject(new Error("لم يتم العثور على ملف الفيديو الناتج."));
      }
    });
  });
}

// استقبال الرسائل النصية
bot.on("message", async (msg) => {
  const text = msg.text || "";

  // تجاهل الأوامر (مثل /start) لأنها تُعالج في onText أعلاه
  if (text.startsWith("/")) return;

  const match = text.match(TIKTOK_URL_PATTERN);
  if (!match) {
    await bot.sendMessage(msg.chat.id, "الرجاء إرسال رابط صحيح من تيك توك.");
    return;
  }

  const url = match[0];
  await bot.sendChatAction(msg.chat.id, "upload_video");
  const statusMsg = await bot.sendMessage(msg.chat.id, "جاري تحميل الفيديو، الرجاء الانتظار...");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-"));

  try {
    const filePath = await downloadTikTok(url, tmpDir);

    const stats = fs.statSync(filePath);
    const maxSize = 50 * 1024 * 1024; // 50 ميجا (حد بوتات تيليجرام العادية)

    if (stats.size > maxSize) {
      await bot.editMessageText(
        "الفيديو حجمه كبير جداً (أكبر من 50MB) ولا يمكن إرساله عبر البوت.",
        { chat_id: msg.chat.id, message_id: statusMsg.message_id }
      );
      return;
    }

    await bot.sendVideo(msg.chat.id, filePath, {
      caption: "تم التحميل بنجاح ✅",
      supports_streaming: true,
    });

    await bot.deleteMessage(msg.chat.id, statusMsg.message_id);
  } catch (err) {
    console.error("فشل التحميل أو الإرسال:", err);
    await bot.editMessageText(`حدث خطأ أثناء التحميل:\n${err.message || err}`, {
      chat_id: msg.chat.id,
      message_id: statusMsg.message_id,
    });
  } finally {
    // تنظيف المجلد المؤقت
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
});
