import fs from "fs";
import { IgApiClient } from "instagram-private-api";
import { createObjectCsvWriter } from "csv-writer";
import { CookieJar, Cookie } from "tough-cookie";

const ig = new IgApiClient();
ig.state.generateDevice("im_lowkey_failing_maj_proj");

const COOKIES_FILE = "./session.json";


async function login() {
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("🚨 cookies.json not found. Please export cookies first!");
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
  const jar = new CookieJar();

  // Convert browser cookies into tough-cookie format
  cookies.forEach(c => {
    try {
      jar.setCookieSync(
        new Cookie({
          key: c.name,
          value: c.value,
          domain: c.domain.replace(/^\./, ""), // remove leading dot
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

  // Load cookies into instagram-private-api
  await ig.state.deserializeCookieJar(jar.toJSON());

  try {
    await ig.account.currentUser();
    console.log("✅ Logged in with browser cookies.");
  } catch (err) {
    console.error("🚨 Cookie login failed. Did you export the correct cookies?");
    process.exit(1);
  }
}

// --- Get user info ---
async function getUserInfo(username) {
  try {
    const basicUser = await ig.user.searchExact(username);
    const user = await ig.user.info(basicUser.pk);

    return {
      username: user.username,
      fullName: user.full_name,
      userId: user.pk,
      biography: user.biography || "",
      website: user.external_url || "",
      followers: user.follower_count || 0,
      following: user.following_count || 0,
      posts: user.media_count || 0,
      verified: user.is_verified,
      private: user.is_private,
      businessAccount: user.is_business || false,
      creatorAccount: user.is_professional || false,
    };
  } catch (err) {
    console.error(`❌ Error scraping ${username}: ${err.message}`);
    return null;
  }
}

// --- CSV Writer ---
const csvWriter = createObjectCsvWriter({
  path: "output.csv",
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
  ],
  append: false,
});

// --- Main ---
async function main() {
  await login();

  const usernames = fs
    .readFileSync("usernames.txt", "utf-8")
    .split("\n")
    .map(u => u.trim())
    .filter(Boolean);

  const results = [];

  for (const username of usernames) {
    console.log(`⏳ Scraping ${username}...`);
    const data = await getUserInfo(username);
    if (data) results.push(data);

    await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000)); // random delay
  }

  await csvWriter.writeRecords(results);
  console.log("✅ Data saved to output.csv");
}

main().catch(console.error);
