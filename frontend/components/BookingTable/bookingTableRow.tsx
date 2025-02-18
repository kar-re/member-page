import React from 'react';
import { useTranslation } from 'next-i18next';
import { Link, TableCell, TableRow } from '@mui/material';
import { BookingRequest } from '~/generated/graphql';
import routes from '~/routes';
import BookingTableModifedStatusCell from './bookingTableModifedStatusCell';
import fromIsoToShortDate from '~/functions/fromIsoToShortDate';
import { getFullName } from '~/functions/memberFunctions';
import { hasAccess, useApiAccess } from '~/providers/ApiAccessProvider';

type BookingTableRowProps = {
  bookingRequest: BookingRequest;
  onChange?: () => void;
};

export default function BookingTableRow({
  bookingRequest,
  onChange,
}: BookingTableRowProps) {
  const { t, i18n } = useTranslation(['common', 'booking']);
  const english = i18n.language === 'en';
  const apiContext = useApiAccess();

  return (
    <TableRow>
      <TableCell align="left" colSpan={3}>
        {fromIsoToShortDate(bookingRequest.start, i18n.language)}
      </TableCell>
      <TableCell align="left" colSpan={3}>
        {fromIsoToShortDate(bookingRequest.end, i18n.language)}
      </TableCell>
      <TableCell align="left" colSpan={3}>
        {bookingRequest.event}
      </TableCell>
      <TableCell align="left" colSpan={3}>
        {bookingRequest.what.map((bookable) => (english ? bookable.name_en : bookable.name)).join(', ')}
      </TableCell>
      <TableCell align="left" colSpan={3}>
        {t(`booking:${bookingRequest.status}`)}
      </TableCell>
      <TableCell align="left" colSpan={3}>
        <Link href={routes.member(bookingRequest.booker.id)}>
          {getFullName(bookingRequest.booker)}
        </Link>
      </TableCell>
      <TableCell align="left" colSpan={3}>
        {fromIsoToShortDate(
          bookingRequest.last_modified || bookingRequest.created,
          i18n.language,
        )}
      </TableCell>
      {

        hasAccess(apiContext, 'booking_request:update') && (
          <BookingTableModifedStatusCell
            onStatusChange={onChange}
            bookingId={bookingRequest.id}
            status={bookingRequest.status}
            align="left"
            colSpan={3}
          />
        )
      }
    </TableRow>
  );
}
