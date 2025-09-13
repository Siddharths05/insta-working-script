import fs from "fs";
import { IgApiClient } from "instagram-private-api";
import { createObjectCsvWriter } from "csv-writer";
import { CookieJar, Cookie } from "tough-cookie";
import readline from "readline";
import { existsSync } from "fs";

const ig = new IgApiClient();
ig.state.generateDevice("im_lowkey_failing_maj_proj");

const COOKIES_FILE = "./session.json";

// --- LOGIN FUNCTION ---
async function login() {
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("🚨 session.json not found. Please export cookies first!");
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
  const jar = new CookieJar();

  cookies.forEach(c => {
    try {
      jar.setCookieSync(
        new Cookie({
          key: c.name,
          value: c.value,
          domain: c.domain.replace(/^\./, ""),
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
        }),
        "https://www.instagram.com"
      );
    } catch (err) {
      console.warn(`⚠️ Skipping cookie ${c.name}: ${err.message}`);
    }
  });

  await ig.state.deserializeCookieJar(jar.toJSON());

  try {
    await ig.account.currentUser();
    console.log("✅ Logged in with browser cookies.");
  } catch (err) {
    console.error("🚨 Cookie login failed. Did you export the correct cookies?");
    process.exit(1);
  }
}

// --- GET USER INFO ---
async function getUserInfo(username) {
  const cleanUsername = username.trim();
  if (!cleanUsername) return null;

  try {
    const basicUser = await ig.user.searchExact(cleanUsername);
    const user = await ig.user.info(basicUser.pk);

    let isTagged = false;
    try {
      const taggedFeed = ig.feed.usertags(user.pk);
      const taggedItems = await taggedFeed.items();
      isTagged = taggedItems.length > 0;
    } catch (err) {
      console.warn(`⚠️ Could not check tagged posts for ${cleanUsername}: ${err.message}`);
    }

    let hasHighlights = false;
    try {
      const highlights = await ig.highlights.highlightsTray(user.pk);
      hasHighlights = highlights.tray.length > 0;
    } catch (err) {
      console.warn(`⚠️ Could not check highlights for ${cleanUsername}: ${err.message}`);
    }

    return {
      username: user.username || "",
      fullName: user.full_name || "",
      userId: user.pk || "",
      biography: user.biography || "",
      website: user.external_url || "",
      followers: user.follower_count || 0,
      following: user.following_count || 0,
      posts: user.media_count || 0,
      verified: user.is_verified || false,
      private: user.is_private || false,
      businessAccount: user.is_business || false,
      creatorAccount: user.is_professional || false,
      isTagged,
      hasHighlights,
    };
  } catch (err) {
    console.error(`❌ Error scraping ${cleanUsername}: ${err.message}`);
    return null;
  }
}

// --- FORMAT DATA FOR CSV ---
function formatUserData(user) {
  return {
    username: user.username || "",
    fullName: user.fullName || "",
    userId: user.userId || "",
    biography: user.biography || "",
    website: user.website || "",
    followers: user.followers || 0,
    following: user.following || 0,
    posts: user.posts || 0,
    verified: user.verified || false,
    private: user.private || false,
    businessAccount: user.businessAccount || false,
    creatorAccount: user.creatorAccount || false,
    isTagged: user.isTagged || false,
    hasHighlights: user.hasHighlights || false,
  };
}

if (!existsSync("bruh.csv")) {
  await csvWriter.writeRecords([]); // This writes just the headers
}

// --- CSV WRITER ---
const csvWriter = createObjectCsvWriter({
  path: "bruh.csv",
  header: [
    { id: "username", title: "Username" },
    { id: "fullName", title: "Full Name" },
    { id: "userId", title: "User ID" },
    { id: "biography", title: "Biography" },
    { id: "website", title: "Website" },
    { id: "followers", title: "Followers" },
    { id: "following", title: "Following" },
    { id: "posts", title: "Posts" },
    { id: "verified", title: "Verified" },
    { id: "private", title: "Private" },
    { id: "businessAccount", title: "Business Account" },
    { id: "creatorAccount", title: "Creator Account" },
    { id: "isTagged", title: "Is Tagged" },
    { id: "hasHighlights", title: "Has Highlights" },
  ],
  append: true,
  encoding: "utf8",
});

// --- GET FOLLOWERS ---
async function scrapeFollowers(username, limit = 50) {
  try {
    const basicUser = await ig.user.searchExact(username);
    const followersFeed = ig.feed.accountFollowers(basicUser.pk);

    const followers = [];
    let count = 0;

    while (count < limit) {
      const batch = await followersFeed.items();
      for (const follower of batch) {
        if (count >= limit) break;
        followers.push(follower.username);
        count++;
      }
      if (!followersFeed.isMoreAvailable()) break;
    }
    return followers;
  } catch (err) {
    console.error(`❌ Could not fetch followers for ${username}: ${err.message}`);
    return [];
  }
}

// --- PROMPT USER ---
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// --- MAIN FUNCTION ---
async function main() {
  await login();

  const usernames = fs
    .readFileSync("usernames.txt", "utf-8")
    .split("\n")
    .map(u => u.trim())
    .filter(Boolean);

  const followersLimitStr = await askQuestion("How many followers do you want to scrape per user? ");
  const followersLimit = parseInt(followersLimitStr);
  if (isNaN(followersLimit) || followersLimit <= 0) {
    console.error("❌ Invalid number entered. Exiting.");
    process.exit(1);
  }

  for (const username of usernames) {
    console.log(`👤 Crawling followers of ${username} (up to ${followersLimit})...`);
    const followerUsernames = await scrapeFollowers(username, followersLimit);

    let scrapedCount = 0;
    for (const follower of followerUsernames) {
      scrapedCount++;
      process.stdout.write(`⏳ Scraping ${follower} (${scrapedCount}/${followersLimit})\r`);
      const data = await getUserInfo(follower);
      if (data) {
        await csvWriter.writeRecords([formatUserData(data)]);
      }
      await new Promise(r => setTimeout(r, 4000));
    }
    console.log(`\n✅ Finished scraping followers of ${username}.\n`);
  }

  console.log("🎉 Done scraping all followers!");
}

main().catch(console.error);
