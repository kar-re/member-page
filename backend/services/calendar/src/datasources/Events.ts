import { ApolloError, UserInputError } from 'apollo-server';
import { dbUtils, context, UUID } from 'dsek-shared';
import * as gql from '../types/graphql';
import * as sql from '../types/database';

export function convertEvent(
  event: sql.Event,
  numberOfLikes?: number,
  isLikedByMe?: boolean,
): gql.Event {
  const { author_id, ...rest } = event;
  const convertedEvent = {
    author: {
      id: author_id,
    },
    ...rest,
    likes: numberOfLikes ?? 0,
    isLikedByMe: isLikedByMe ?? false,
  };
  return convertedEvent;
}

export default class Events extends dbUtils.KnexDataSource {
  getEvent(ctx: context.UserContext, id: UUID): Promise<gql.Maybe<gql.Event>> {
    return this.withAccess('event:read', ctx, async () => {
      const event = await dbUtils.unique(
        this.knex<sql.Event>('events').where({ id }),
      );
      if (!event) {
        return undefined;
      }
      return convertEvent(event);
    });
  }

  getEvents(
    ctx: context.UserContext,
    page?: number,
    perPage?: number,
    filter?: gql.EventFilter,
  ): Promise<gql.EventPagination> {
    return this.withAccess('event:read', ctx, async () => {
      let filtered = this.knex<sql.Event>('events');

      if (filter) {
        if (filter.start_datetime || filter.end_datetime) {
          if (!filter.end_datetime) {
            filtered = filtered.where(
              'start_datetime',
              '>=',
              filter.start_datetime,
            );
          } else if (!filter.start_datetime) {
            filtered = filtered.where(
              'start_datetime',
              '<=',
              filter.end_datetime,
            );
          } else {
            filtered = filtered.whereBetween('start_datetime', [
              filter.start_datetime,
              filter.end_datetime,
            ]);
          }
          if (filter.id) {
            filtered = filtered.where({ id: filter.id });
          }
        } else if (filter.id) {
          filtered = filtered.where({ id: filter.id });
        }
      }

      if (page === undefined || perPage === undefined) {
        return {
          events: await Promise.all(
            (
              await filtered
            ).map((event) => convertEvent(event)),
          ),
        };
      }
      const res = await filtered
        .clone()
        .offset(page * perPage)
        .limit(perPage);
      const events = await Promise.all(
        res.map((e) => convertEvent(e)),
      );
      const totalEvents = (await filtered.clone().count({ count: '*' }))[0].count || 0;
      const pageInfo = dbUtils.createPageInfo(
        <number>totalEvents,
        page,
        perPage,
      );

      return {
        events,
        pageInfo,
      };
    });
  }

  async getLikes(event_id: UUID): Promise<number> {
    return (
      Object.fromEntries(
        (
          await this.knex<sql.Like>('event_likes')
            .select('event_id')
            .count({ count: '*' })
            .where({ event_id })
            .groupBy('event_id')
        ).map((r) => [r.event_id, Number(r.count)]),
      )[event_id] ?? 0
    );
  }

  async isLikedByUser(event_id: UUID, keycloak_id?: string): Promise<boolean> {
    if (!keycloak_id) return false;
    return (
      Object.fromEntries(
        (
          await this.knex<sql.Like>('event_likes')
            .select('event_id')
            .join(
              'keycloak',
              'keycloak.member_id',
              '=',
              'event_likes.member_id',
            )
            .where({ keycloak_id })
            .where({ event_id })
        ).map((r) => [r.event_id, true]),
      )[event_id] ?? false
    );
  }

  createEvent(
    ctx: context.UserContext,
    input: gql.CreateEvent,
  ): Promise<gql.Maybe<gql.Event>> {
    return this.withAccess('event:create', ctx, async () => {
      const user = await dbUtils.unique(
        this.knex<sql.Keycloak>('keycloak').where({
          keycloak_id: ctx.user?.keycloak_id,
        }),
      );
      if (!user) {
        throw new ApolloError('Could not find member based on keycloak id');
      }
      const newEvent = { ...input, author_id: user.member_id };
      const id = (
        await this.knex('events').insert(newEvent).returning('id')
      )[0];
      const event: sql.Event = {
        id, ...newEvent, number_of_updates: 0, link: newEvent.link ?? '',
      };
      const convertedEvent = convertEvent(event);
      return convertedEvent;
    });
  }

  updateEvent(
    ctx: context.UserContext,
    id: UUID,
    input: gql.UpdateEvent,
  ): Promise<gql.Maybe<gql.Event>> {
    return this.withAccess('event:update', ctx, async () => {
      const before = (await this.knex<sql.Event>('events').where({ id }))[0];
      if (!before) throw new UserInputError('id did not exist');

      await this.knex('events')
        .where({ id })
        .update({ ...input, number_of_updates: before.number_of_updates + 1 });
      const res = (await this.knex<sql.Event>('events').where({ id }))[0];
      if (!res) throw new UserInputError('id did not exist');
      return convertEvent(res);
    });
  }

  removeEvent(
    ctx: context.UserContext,
    id: UUID,
  ): Promise<gql.Maybe<gql.Event>> {
    return this.withAccess('event:delete', ctx, async () => {
      const res = (await this.knex<sql.Event>('events').where({ id }))[0];
      if (!res) throw new UserInputError('id did not exist');
      await this.knex('events').where({ id }).del();
      return convertEvent(res);
    });
  }

  likeEvent(
    ctx: context.UserContext,
    id: UUID,
  ): Promise<gql.Maybe<gql.Event>> {
    return this.withAccess('event:like', ctx, async () => {
      const user = await dbUtils.unique(this.knex<sql.Keycloak>('keycloak').where({ keycloak_id: ctx.user?.keycloak_id }));

      if (!user) {
        throw new ApolloError(`Could not find member based on keycloak id. Id: ${ctx.user?.keycloak_id}`);
      }

      const event = await dbUtils.unique(this.knex<sql.Event>('events').where({ id }));
      if (!event) throw new UserInputError(`Event with id did not exist. Id: ${id}`);

      try {
        await this.knex<sql.Like>('event_likes').insert({
          event_id: id,
          member_id: user.member_id,
        });
      } catch {
        throw new ApolloError('User already liked this event');
      }

      return convertEvent(
        event,
        await this.getLikes(id),
        true,
      );
    });
  }

  unlikeEvent(
    ctx: context.UserContext,
    id: UUID,
  ): Promise<gql.Maybe<gql.Event>> {
    return this.withAccess('event:like', ctx, async () => {
      const user = await dbUtils.unique(this.knex<sql.Keycloak>('keycloak').where({ keycloak_id: ctx.user?.keycloak_id }));

      if (!user) {
        throw new ApolloError(`Could not find member based on keycloak id. Id: ${ctx.user?.keycloak_id}`);
      }

      const event = await dbUtils.unique(this.knex<sql.Event>('events').where({ id }));
      if (!event) throw new UserInputError(`Event with id did not exist. Id: ${id}`);

      const currentLike = await this.knex<sql.Like>('event_likes').where({
        event_id: id,
        member_id: user.member_id,
      }).del();

      if (!currentLike) throw new ApolloError('User doesn\'t like this event');
      return convertEvent(
        event,
        await this.getLikes(id),
        false,
      );
    });
  }
}
