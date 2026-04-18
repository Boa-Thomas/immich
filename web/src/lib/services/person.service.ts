import { eventManager } from '$lib/managers/event-manager.svelte';
import PersonEditBirthDateModal from '$lib/modals/PersonEditBirthDateModal.svelte';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { updatePerson, type PersonResponseDto } from '@immich/sdk';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import {
  mdiCalendarEditOutline,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiHeartMinusOutline,
  mdiHeartOutline,
} from '@mdi/js';
import type { MessageFormatter } from 'svelte-i18n';

export const getPersonActions = ($t: MessageFormatter, person: PersonResponseDto) => {
  // Borrowed (shared-album / partner) people are read-only: ownerId is present
  // and isOwner is false. When the field is absent (older clients), default to
  // allowing the action so behavior matches the previous version.
  const isReadOnly = person.isOwner === false;

  const SetDateOfBirth: ActionItem = {
    title: $t('set_date_of_birth'),
    icon: mdiCalendarEditOutline,
    $if: () => !isReadOnly,
    onAction: () => modalManager.show(PersonEditBirthDateModal, { person }),
  };

  const Favorite: ActionItem = {
    title: $t('to_favorite'),
    icon: mdiHeartOutline,
    $if: () => !isReadOnly && !person.isFavorite,
    onAction: () => handleFavoritePerson(person),
  };

  const Unfavorite: ActionItem = {
    title: $t('unfavorite'),
    icon: mdiHeartMinusOutline,
    $if: () => !isReadOnly && !!person.isFavorite,
    onAction: () => handleUnfavoritePerson(person),
  };

  const HidePerson: ActionItem = {
    title: $t('hide_person'),
    icon: mdiEyeOffOutline,
    $if: () => !isReadOnly && !person.isHidden,
    onAction: () => handleHidePerson(person),
  };

  const ShowPerson: ActionItem = {
    title: $t('unhide_person'),
    icon: mdiEyeOutline,
    $if: () => !isReadOnly && !!person.isHidden,
    onAction: () => handleShowPerson(person),
  };

  return { SetDateOfBirth, Favorite, Unfavorite, HidePerson, ShowPerson };
};

const handleFavoritePerson = async (person: { id: string }) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { isFavorite: true } });
    eventManager.emit('PersonUpdate', response);
    toastManager.primary($t('added_to_favorites'));
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: false } }));
  }
};

const handleUnfavoritePerson = async (person: { id: string }) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { isFavorite: false } });
    eventManager.emit('PersonUpdate', response);
    toastManager.primary($t('removed_from_favorites'));
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: false } }));
  }
};

const handleHidePerson = async (person: { id: string }) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { isHidden: true } });
    toastManager.primary($t('changed_visibility_successfully'));
    eventManager.emit('PersonUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.unable_to_hide_person'));
  }
};

const handleShowPerson = async (person: { id: string }) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { isHidden: false } });
    toastManager.primary($t('changed_visibility_successfully'));
    eventManager.emit('PersonUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.something_went_wrong'));
  }
};

export const handleUpdatePersonBirthDate = async (person: PersonResponseDto, birthDate: string) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { birthDate } });
    toastManager.primary($t('date_of_birth_saved'));
    eventManager.emit('PersonUpdate', response);
    return true;
  } catch (error) {
    handleError(error, $t('errors.unable_to_save_date_of_birth'));
  }
};
