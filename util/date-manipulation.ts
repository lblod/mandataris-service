import moment from 'moment';

export function endOfDay(date?: Date) {
  if (date) {
    return moment(date).add(1, 'days').startOf('day').toDate();
  } else {
    return moment().add(1, 'days').startOf('day').toDate();
  }
}
