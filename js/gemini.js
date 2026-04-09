/**
 * AI categorization — browser calls our server only.
 * The server reads the Gemini API key from the environment or config file (not from the page).
 *
 * @param {string} title Task text
 * @returns {Promise<string>} One of: Work, Study, Health, Shopping, Personal, Other
 */
async function requestAiCategory(title) {
  const res = await fetch("/api/ai/categorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
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
