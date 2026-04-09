/**
 * AI categorization — browser calls OUR server only.
 * The server forwards the request to Gemini (avoids CORS and keeps the key off the client when you use GEMINI_API_KEY).
 *
 * @param {string} title Task text
 * @param {string} [apiKey] Optional; sent only if provided (e.g. saved in browser). Otherwise the server uses the GEMINI_API_KEY environment variable.
 * @returns {Promise<string>} One of: Work, Study, Health, Shopping, Personal, Other
 */
async function requestAiCategory(title, apiKey) {
  const res = await fetch("/api/ai/categorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      ...(apiKey && String(apiKey).trim().length > 0
        ? { apiKey: String(apiKey).trim() }
        : {}),
    }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Request failed (${res.status})`
    );
  }

  if (typeof data.category !== "string") {
    throw new Error("Invalid response from server.");
  }

  return data.category;
}
