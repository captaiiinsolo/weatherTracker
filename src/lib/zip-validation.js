export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const US_ZIP_REGEX = /^\d{5}(?:-\d{4})?$/;

export function isValidUsZip(zip) {
  return US_ZIP_REGEX.test(String(zip || "").trim());
}

export function normalizeZip(zip, countryCode = "US") {
  const normalizedZip = String(zip || "").trim();
  const normalizedCountryCode = String(countryCode || "US").trim().toUpperCase();

  if (!normalizedZip) {
    return normalizedZip;
  }

  if (normalizedCountryCode === "US" && !isValidUsZip(normalizedZip)) {
    throw new ValidationError(
      "Invalid US ZIP code. Use a real ZIP in 5-digit or ZIP+4 format, like 85001 or 85001-1234."
    );
  }

  return normalizedZip;
}
