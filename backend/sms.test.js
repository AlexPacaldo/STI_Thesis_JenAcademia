import test from "node:test";
import assert from "node:assert/strict";
import { isPhoneVerificationConfigured, sendPhoneVerificationCode, SmsError } from "./sms.js";

const ENV_KEYS = ["SEMAPHORE_API_KEY", "SEMAPHORE_SENDER_NAME"];

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

const okResponse = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("the provider is only considered configured when both settings exist", async () => {
  assert.equal(isPhoneVerificationConfigured(), false);
  await withEnv({ SEMAPHORE_API_KEY: "key" }, () => {
    assert.equal(isPhoneVerificationConfigured(), false);
  });
  await withEnv({ SEMAPHORE_API_KEY: "key", SEMAPHORE_SENDER_NAME: "JENACADEMIA" }, () => {
    assert.equal(isPhoneVerificationConfigured(), true);
  });
});

test("a send converts the number and returns the code from the provider", async () => {
  await withEnv({ SEMAPHORE_API_KEY: "key", SEMAPHORE_SENDER_NAME: "JENACADEMIA" }, async () => {
    let capturedBody = null;
    await withFetch(
      async (url, options) => {
        assert.equal(url, "https://api.semaphore.co/api/v4/otp");
        capturedBody = options.body;
        return okResponse([{ message_id: 99, status: "Queued", code: 123456 }]);
      },
      async () => {
        const sent = await sendPhoneVerificationCode({ phone: "+639785344325" });
        assert.equal(sent.code, "123456");
        assert.equal(sent.providerMessageId, 99);
      }
    );

    const body = capturedBody;
    assert.equal(body.get("number"), "09785344325");
    assert.equal(body.get("apikey"), "key");
    assert.equal(body.get("sendername"), "JENACADEMIA");
    assert.match(body.get("message"), /\{otp\}/);
  });
});

test("a code the provider reports as failed is not accepted", async () => {
  await withEnv({ SEMAPHORE_API_KEY: "key", SEMAPHORE_SENDER_NAME: "JENACADEMIA" }, async () => {
    await withFetch(
      async () => okResponse([{ message_id: 1, status: "Failed", code: 123456 }]),
      async () => {
        await assert.rejects(
          () => sendPhoneVerificationCode({ phone: "+639785344325" }),
          (err) => err instanceof SmsError && err.status === 502
        );
      }
    );
  });
});

test("a non-Philippine number is refused before any request is made", async () => {
  await withEnv({ SEMAPHORE_API_KEY: "key", SEMAPHORE_SENDER_NAME: "JENACADEMIA" }, async () => {
    let called = false;
    await withFetch(
      async () => {
        called = true;
        return okResponse([{ code: 123456 }]);
      },
      async () => {
        await assert.rejects(
          () => sendPhoneVerificationCode({ phone: "+14155552671" }),
          (err) => err instanceof SmsError && err.status === 400
        );
      }
    );
    assert.equal(called, false);
  });
});

test("an unconfigured provider refuses with a setup message", async () => {
  await withEnv({}, async () => {
    await assert.rejects(
      () => sendPhoneVerificationCode({ phone: "+639785344325" }),
      (err) => err instanceof SmsError && err.status === 503
    );
  });
});
