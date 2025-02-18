import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useKeycloak } from '@react-keycloak/ssr';
import { KeycloakInstance } from 'keycloak-js';
import { Checkbox, FormControlLabel } from '@mui/material';
import { DateTime } from 'luxon';
import EventCard from './EventCard';
import {
  useEventsQuery,
} from '~/generated/graphql';
import ArticleSkeleton from '~/components/News/articleSkeleton';

export default function EventSet() {
  const [showPastEvents, setShowPastEvents] = useState(false);
  const { initialized } = useKeycloak<KeycloakInstance>();
  const { t } = useTranslation('news');

  const { loading, data, refetch } = useEventsQuery();

  const refetchAll = useCallback(() => {
    refetch({ start_datetime: showPastEvents ? undefined : DateTime.now() });
  }, [refetch, showPastEvents]);

  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  // This doesn't work because it overwrites currently held data
  // so only specific ID will be shown after refetching.
  // TODO: Fix this.
  // const refetchById = useCallback((eventId) => {
  //   refetch({ id: eventId });
  // }, [refetch])

  if (loading || !initialized) {
    return (
      <>
        <ArticleSkeleton />
        <ArticleSkeleton />
        <ArticleSkeleton />
      </>
    );
  }

  if (!data?.events) return <p>{t('failedLoadingNews')}</p>;

  return (
    <div>
      <FormControlLabel
        control={(
          <Checkbox
            checked={showPastEvents}
            onChange={(event) => {
              setShowPastEvents(event.target.checked);
            }}
          />
        )}
        label={t('event:show_finished_events').toString()}
      />
      {data?.events.events.map((event) =>
        (event ? (
          <div key={event.id}>
            <EventCard event={event} refetch={refetchAll} />
          </div>
        ) : (
          <div>{t('articleError')}</div>
        )))}
    </div>
  );
}
