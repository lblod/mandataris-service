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

export function startOfDay(date?: Date) {
  if (date) {
    return moment(date).startOf('day').utc().toDate();
  } else {
    return moment().startOf('day').utc().toDate();
  }
}
