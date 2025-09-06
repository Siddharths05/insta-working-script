import InstaTouch from "instatouch";

const test = await InstaTouch.getUserMeta("instagram", {
  session: "6831706502%3A5fjcrywrga0KqT%3A7%3AAYdFGA0mC8QJZvfhm92NmDkBI7L30QkUOydKDtsEsuk"
});

console.log(test.username, test.fullName);
