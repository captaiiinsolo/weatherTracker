export function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function describeEtaSource(source) {
  switch (source) {
    case "carrier_estimated_delivery":
      return "Carrier ETA";
    case "delivery_date_attribute":
      return "Order attribute";
    default:
      return "Unavailable";
  }
}
