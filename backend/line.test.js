import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  LineError,
  buildLineTextMessage,
  createLineLinkCode,
  getLineBotInfo,
  hashLineLinkCode,
  isLineConfigured,
  isLineWebhookConfigured,
  lineAddFriendUrl,
  lineBasicId,
  normalizeLineUserId,
  pushLineText,
  replyLineText,
  truncateLineText,
  verifyLineSignature,
} from "./line.js";

const ENV_KEYS = [
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "LINE_BOT_BASIC_ID",
  "LINE_BOT_ADD_FRIEND_URL",
];

async function withEnv(values, run) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function withFetch(handler, run) {
  const original = global.fetch;
  global.fetch = handler;
  try {
    return await run();
  } finally {
    global.fetch = original;
  }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("LINE is only configured when a channel access token exists", async () => {
  await withEnv({}, () => {
    assert.equal(isLineConfigured(), false);
    assert.equal(isLineWebhookConfigured(), false);
  });
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token" }, () => {
    assert.equal(isLineConfigured(), true);
    assert.equal(isLineWebhookConfigured(), false);
  });
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token", LINE_CHANNEL_SECRET: "secret" }, () => {
    assert.equal(isLineWebhookConfigured(), true);
  });
});

test("the webhook signature is checked against the exact request bytes", async () => {
  await withEnv({ LINE_CHANNEL_SECRET: "secret" }, () => {
    const body = Buffer.from(JSON.stringify({ events: [{ type: "follow" }] }), "utf8");
    const signature = crypto.createHmac("sha256", "secret").update(body).digest("base64");

    assert.equal(verifyLineSignature(body, signature), true);
    assert.equal(verifyLineSignature(body, "not-a-signature"), false);
    assert.equal(verifyLineSignature(Buffer.from("{}"), signature), false);
  });
});

test("a missing webhook secret refuses every signature", async () => {
  await withEnv({}, () => {
    assert.equal(verifyLineSignature(Buffer.from("{}"), "anything"), false);
  });
});

test("LINE user ids are validated before a push is attempted", async () => {
  assert.equal(normalizeLineUserId("U" + "a".repeat(32)), "U" + "a".repeat(32));
  assert.equal(normalizeLineUserId(" U" + "a".repeat(32) + " "), "U" + "a".repeat(32));
  assert.equal(normalizeLineUserId("not-a-user"), "");
  assert.equal(normalizeLineUserId("U123"), "");
});

test("long messages are truncated to LINE's limit", () => {
  const message = buildLineTextMessage("x".repeat(6000));
  assert.equal(message.type, "text");
  assert.equal(message.text.length, 5000);
  assert.ok(message.text.endsWith("..."));
  assert.equal(truncateLineText("short"), "short");
});

test("the Basic ID and add-friend URL handle a missing or prefixed @", async () => {
  await withEnv({}, () => {
    assert.equal(lineBasicId(), "");
    assert.equal(lineAddFriendUrl(), "");
  });
  await withEnv({ LINE_BOT_BASIC_ID: "123abcde" }, () => {
    assert.equal(lineBasicId(), "@123abcde");
    assert.equal(lineAddFriendUrl(), "https://line.me/R/ti/p/@123abcde");
  });
  await withEnv({ LINE_BOT_ADD_FRIEND_URL: "https://example.com/add" }, () => {
    assert.equal(lineAddFriendUrl(), "https://example.com/add");
  });
});

test("a push sends the token, the user id and one text message", async () => {
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token" }, async () => {
    let captured = null;
    await withFetch(
      async (url, options) => {
        captured = { url, options };
        return jsonResponse({});
      },
      async () => {
        const result = await pushLineText("U" + "b".repeat(32), "Hello from JEN Academia");
        assert.deepEqual(result, { ok: true });
      }
    );

    assert.equal(captured.url, "https://api.line.me/v2/bot/message/push");
    assert.equal(captured.options.headers.Authorization, "Bearer token");
    const body = JSON.parse(captured.options.body);
    assert.equal(body.to, "U" + "b".repeat(32));
    assert.deepEqual(body.messages, [{ type: "text", text: "Hello from JEN Academia" }]);
  });
});

test("a blocked recipient is a permanent error, not a retry loop", async () => {
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token" }, async () => {
    await withFetch(
      async () => jsonResponse({ message: "The user has blocked the bot." }, 403),
      async () => {
        await assert.rejects(
          () => pushLineText("U" + "c".repeat(32), "Hello"),
          (err) =>
            err instanceof LineError &&
            err.status === 403 &&
            err.retryable === false &&
            /blocked/.test(err.message)
        );
      }
    );
  });
});

test("a rate limit is marked retryable", async () => {
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token" }, async () => {
    await withFetch(
      async () => jsonResponse({ message: "Too many requests" }, 429),
      async () => {
        await assert.rejects(
          () => pushLineText("U" + "d".repeat(32), "Hello"),
          (err) => err instanceof LineError && err.status === 429 && err.retryable === true
        );
      }
    );
  });
});

test("a reply uses the reply token instead of a user id", async () => {
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token" }, async () => {
    let captured = null;
    await withFetch(
      async (url, options) => {
        captured = { url, options };
        return jsonResponse({});
      },
      async () => {
        await replyLineText("reply-token", "Connected!");
      }
    );

    assert.equal(captured.url, "https://api.line.me/v2/bot/message/reply");
    const body = JSON.parse(captured.options.body);
    assert.equal(body.replyToken, "reply-token");
    assert.equal(body.messages[0].text, "Connected!");
  });
});

test("linking codes are six digits and their hash is deterministic", () => {
  assert.equal(createLineLinkCode(() => 42), "000042");
  assert.equal(createLineLinkCode(() => 999999), "999999");
  assert.equal(
    hashLineLinkCode("123456", "secret"),
    hashLineLinkCode("123456", "secret")
  );
  assert.notEqual(hashLineLinkCode("123456", "secret"), hashLineLinkCode("123457", "secret"));
  assert.throws(() => hashLineLinkCode("123456", ""), /needs a secret/);
});

test("the bot profile is cached so the account page does not call LINE every time", async () => {
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: "token" }, async () => {
    let calls = 0;
    await withFetch(
      async () => {
        calls += 1;
        return jsonResponse({ basicId: "@school", displayName: "JEN Academia" });
      },
      async () => {
        const first = await getLineBotInfo();
        const second = await getLineBotInfo();
        assert.equal(first.displayName, "JEN Academia");
        assert.equal(second.displayName, "JEN Academia");
        assert.equal(calls, 1);
      }
    );
  });
});
