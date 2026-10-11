/**
 * Indonesian server message -> English translation.
 * A key without placeholders is an exact entry. A key with `{0}`, `{1}`, ... is a pattern entry: each
 * placeholder matches the dynamic part of the message (number, document number, name, nested message)
 * and is copied into the English text at the placeholder with the same index.
 */
export type MessageDictionary = Readonly<Record<string, string>>;
