import moment from 'moment';

export function endOfDay(date?: Date, returnNullWhenUndefined = false) {
  if (!date && returnNullWhenUndefined) {
    return null;
  }

  if (date) {
    return moment(date)
      .add(1, 'days')
      .startOf('day')
      .subtract(1, 'second')
      .utc()
      .toDate();
  } else {
    return moment()
      .add(1, 'days')
      .startOf('day')
      .subtract(1, 'second')
      .utc()
      .toDate();
  }
}

export function startOfDay(date?: Date, returnNullWhenUndefined = false) {
  if (!date && returnNullWhenUndefined) {
    return null;
  }

  if (date) {
    return moment(date).startOf('day').utc().toDate();
  } else {
    return moment().startOf('day').utc().toDate();
  }
}
