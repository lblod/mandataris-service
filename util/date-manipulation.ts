import moment from 'moment';

export function endOfDay(date?: Date) {
  if (date) {
    return moment(date)
      .add(1, 'days')
      .startOf('day')
      .subtract(1, 'second')
      .toDate();
  } else {
    return moment()
      .add(1, 'days')
      .startOf('day')
      .subtract(1, 'second')
      .toDate();
  }
}
