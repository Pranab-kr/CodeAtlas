/**
 * Chat completions return content as a string for text models, but the SDK
 * also models multipart content. Only text parts can be used here.
 */
export function messageText(
  content: string | readonly { type: string; text?: string }[] | null,
): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}
