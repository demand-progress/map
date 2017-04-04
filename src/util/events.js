import moment from 'moment';
import distance from 'turf-distance';

const metersToMiles = (meters) => meters * 0.00062137;

export function computeFilteredEvents(events, filters, zipcodes) {
  // Bail out early if possible. Huge array!
  if (!Object.keys(filters).length) {
    return events;
  }

  const zipcodesLength = Object.keys(zipcodes).length;
  const validZipcode = zipcodesLength && !!zipcodes[filters.zipcode];

  // A zipcode is selected but either we do not yet have valid zipcodes
  // to check it against and get its coords, or the zipcode is invalid;
  // either way there can be no valid events. Bail early.
  if (filters.zipcode && (!zipcodesLength || !validZipcode)) {
    return [];
  }

  return events.filter(function(event) {

    if (filters.eventType) {
      if (!event.categories) {
        return false;
      }

      const allCategories = event.categories.split(',');
      const allEventTypes = filters.eventType.split(',');

      const eventIsInNoSelectedCategories = allEventTypes.every(type =>
        !allCategories.includes(type)
      );

      if (eventIsInNoSelectedCategories) {
        return false;
      }
    }

    // note: there is also a utc timestamp, this one is localized
    const localDatetime = moment(event.start_datetime);

    if (filters.startDate) {
      const startDate = moment(filters.startDate, 'YYYY-MM-DD');

      if (localDatetime.isBefore(startDate, 'day')) {
        return false;
      }
    }

    if (filters.endDate) {
      const endDate = moment(filters.endDate, 'YYYY-MM-DD');

      if (localDatetime.isAfter(endDate, 'day')) {
        return false;
      }
    }

    if (filters.zipcode) {
      // We do not yet have valid zipcodes to filter against,
      // give it a pass.
      if (!zipcodes || !zipCodesLength) {
        return true;
      }

      const milesFromZipcode = metersToMiles(
        distance(zipcodes[filters.zipcode].reverse(), [event.lng, event.lat])
      );

      const MAX_MILES_FROM_ZIPCODE = 50;

      if (milesFromZipcode > MAX_MILES_FROM_ZIPCODE) {
        return false;
      }
    }

    return true;
  });
}

export const eventTypes = {
  freedomcities: "Freedom Cities Action",
  muslimban: "Muslim Ban Action",
  protestrally: "Protest/Rally",
  townmeeting: "Town Meeting",
  organizing: "Organizing Meeting",
  healthcareaction: "Health Care Action",
  other: "Other"
};
