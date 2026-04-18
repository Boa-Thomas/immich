import { BadRequestException } from '@nestjs/common';
import { mapAsset } from 'src/dtos/asset-response.dto';
import { SearchSuggestionType } from 'src/dtos/search.dto';
import { SearchService } from 'src/services/search.service';
import { AssetFactory } from 'test/factories/asset.factory';
import { AuthFactory } from 'test/factories/auth.factory';
import { authStub } from 'test/fixtures/auth.stub';
import { getForAsset } from 'test/mappers';
import { newTestService, ServiceMocks } from 'test/utils';
import { beforeEach, vitest } from 'vitest';

vitest.useFakeTimers();

describe(SearchService.name, () => {
  let sut: SearchService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(SearchService));
    mocks.partner.getAll.mockResolvedValue([]);
    mocks.album.getOwnerIdsSharedWith.mockResolvedValue([]);
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('searchPerson', () => {
    it('should pass options to search', async () => {
      const auth = AuthFactory.create();
      const name = 'foo';

      mocks.person.getByName.mockResolvedValue([]);

      await sut.searchPerson(auth, { name, withHidden: false });

      expect(mocks.person.getByName).toHaveBeenCalledWith(auth.user.id, [auth.user.id], name, { withHidden: false });

      await sut.searchPerson(auth, { name, withHidden: true });

      expect(mocks.person.getByName).toHaveBeenCalledWith(auth.user.id, [auth.user.id], name, { withHidden: true });
    });

    it('should widen owner IDs to include partners who share timeline', async () => {
      const auth = AuthFactory.create();
      const partnerId = 'partner-1';
      mocks.person.getByName.mockResolvedValue([]);
      mocks.partner.getAll.mockResolvedValue([
        {
          sharedById: partnerId,
          sharedWithId: auth.user.id,
          inTimeline: true,
          sharedBy: { id: partnerId } as never,
          sharedWith: { id: auth.user.id } as never,
        } as never,
      ]);

      await sut.searchPerson(auth, { name: 'john', withHidden: false });

      expect(mocks.person.getByName).toHaveBeenCalledWith(
        auth.user.id,
        expect.arrayContaining([auth.user.id, partnerId]),
        'john',
        { withHidden: false },
      );
    });

    it('should widen owner IDs to include users who shared an album with the viewer', async () => {
      const auth = AuthFactory.create();
      const sharerId = 'sharer-1';
      mocks.person.getByName.mockResolvedValue([]);
      mocks.album.getOwnerIdsSharedWith.mockResolvedValue([sharerId]);

      await sut.searchPerson(auth, { name: 'john', withHidden: false });

      expect(mocks.album.getOwnerIdsSharedWith).toHaveBeenCalledWith(auth.user.id);
      expect(mocks.person.getByName).toHaveBeenCalledWith(
        auth.user.id,
        expect.arrayContaining([auth.user.id, sharerId]),
        'john',
        { withHidden: false },
      );
    });

    it('should de-duplicate owner IDs when a partner also shares an album', async () => {
      const auth = AuthFactory.create();
      const bothId = 'both-1';
      mocks.person.getByName.mockResolvedValue([]);
      mocks.partner.getAll.mockResolvedValue([
        {
          sharedById: bothId,
          sharedWithId: auth.user.id,
          inTimeline: true,
          sharedBy: { id: bothId } as never,
          sharedWith: { id: auth.user.id } as never,
        } as never,
      ]);
      mocks.album.getOwnerIdsSharedWith.mockResolvedValue([bothId]);

      await sut.searchPerson(auth, { name: 'john', withHidden: false });

      const ownerIds = mocks.person.getByName.mock.calls[0][1] as string[];
      expect(ownerIds).toEqual([auth.user.id, bothId]);
    });
  });

  describe('searchMetadata', () => {
    beforeEach(() => {
      mocks.search.searchMetadata.mockResolvedValue({ hasNextPage: false, items: [] });
    });

    it('should not widen to album-accessible assets when no personIds are passed', async () => {
      const auth = AuthFactory.create();
      await sut.searchMetadata(auth, {} as never);
      expect(mocks.search.searchMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ albumSharedWithUserId: undefined }),
      );
    });

    it('should widen to album-accessible assets when personIds are passed', async () => {
      const auth = AuthFactory.create();
      await sut.searchMetadata(auth, { personIds: ['p-1'] } as never);
      expect(mocks.search.searchMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ albumSharedWithUserId: auth.user.id, personIds: ['p-1'] }),
      );
    });
  });

  describe('searchPlaces', () => {
    it('should search places', async () => {
      mocks.search.searchPlaces.mockResolvedValue([
        {
          id: 42,
          name: 'my place',
          latitude: 420,
          longitude: 69,
          admin1Code: null,
          admin1Name: null,
          admin2Code: null,
          admin2Name: null,
          alternateNames: null,
          countryCode: 'US',
          modificationDate: new Date(),
        },
      ]);

      await sut.searchPlaces({ name: 'place' });
      expect(mocks.search.searchPlaces).toHaveBeenCalledWith('place');
    });
  });

  describe('getExploreData', () => {
    it('should get assets by city and tag', async () => {
      const auth = AuthFactory.create();
      const asset = AssetFactory.from()
        .exif({ latitude: 42, longitude: 69, city: 'city', state: 'state', country: 'country' })
        .build();
      mocks.asset.getAssetIdByCity.mockResolvedValue({
        fieldName: 'exifInfo.city',
        items: [{ value: 'city', data: asset.id }],
      });
      mocks.asset.getByIdsWithAllRelationsButStacks.mockResolvedValue([asset as never]);
      const expectedResponse = [
        { fieldName: 'exifInfo.city', items: [{ value: 'city', data: mapAsset(getForAsset(asset)) }] },
      ];

      const result = await sut.getExploreData(auth);

      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return search suggestions for country', async () => {
      mocks.search.getCountries.mockResolvedValue(['USA']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: false, type: SearchSuggestionType.COUNTRY }),
      ).resolves.toEqual(['USA']);
      expect(mocks.search.getCountries).toHaveBeenCalledWith([authStub.user1.user.id]);
    });

    it('should return search suggestions for country (including null)', async () => {
      mocks.search.getCountries.mockResolvedValue(['USA']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: true, type: SearchSuggestionType.COUNTRY }),
      ).resolves.toEqual(['USA', null]);
      expect(mocks.search.getCountries).toHaveBeenCalledWith([authStub.user1.user.id]);
    });

    it('should return search suggestions for state', async () => {
      mocks.search.getStates.mockResolvedValue(['California']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: false, type: SearchSuggestionType.STATE }),
      ).resolves.toEqual(['California']);
      expect(mocks.search.getStates).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for state (including null)', async () => {
      mocks.search.getStates.mockResolvedValue(['California']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: true, type: SearchSuggestionType.STATE }),
      ).resolves.toEqual(['California', null]);
      expect(mocks.search.getStates).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for city', async () => {
      mocks.search.getCities.mockResolvedValue(['Denver']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: false, type: SearchSuggestionType.CITY }),
      ).resolves.toEqual(['Denver']);
      expect(mocks.search.getCities).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for city (including null)', async () => {
      mocks.search.getCities.mockResolvedValue(['Denver']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: true, type: SearchSuggestionType.CITY }),
      ).resolves.toEqual(['Denver', null]);
      expect(mocks.search.getCities).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for camera make', async () => {
      mocks.search.getCameraMakes.mockResolvedValue(['Nikon']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: false, type: SearchSuggestionType.CAMERA_MAKE }),
      ).resolves.toEqual(['Nikon']);
      expect(mocks.search.getCameraMakes).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for camera make (including null)', async () => {
      mocks.search.getCameraMakes.mockResolvedValue(['Nikon']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: true, type: SearchSuggestionType.CAMERA_MAKE }),
      ).resolves.toEqual(['Nikon', null]);
      expect(mocks.search.getCameraMakes).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for camera model', async () => {
      mocks.search.getCameraModels.mockResolvedValue(['Fujifilm X100VI']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: false, type: SearchSuggestionType.CAMERA_MODEL }),
      ).resolves.toEqual(['Fujifilm X100VI']);
      expect(mocks.search.getCameraModels).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for camera model (including null)', async () => {
      mocks.search.getCameraModels.mockResolvedValue(['Fujifilm X100VI']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: true, type: SearchSuggestionType.CAMERA_MODEL }),
      ).resolves.toEqual(['Fujifilm X100VI', null]);
      expect(mocks.search.getCameraModels).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for camera lens model', async () => {
      mocks.search.getCameraLensModels.mockResolvedValue(['10-24mm']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: false, type: SearchSuggestionType.CAMERA_LENS_MODEL }),
      ).resolves.toEqual(['10-24mm']);
      expect(mocks.search.getCameraLensModels).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });

    it('should return search suggestions for camera lens model (including null)', async () => {
      mocks.search.getCameraLensModels.mockResolvedValue(['10-24mm']);
      mocks.partner.getAll.mockResolvedValue([]);

      await expect(
        sut.getSearchSuggestions(authStub.user1, { includeNull: true, type: SearchSuggestionType.CAMERA_LENS_MODEL }),
      ).resolves.toEqual(['10-24mm', null]);
      expect(mocks.search.getCameraLensModels).toHaveBeenCalledWith([authStub.user1.user.id], expect.anything());
    });
  });

  describe('searchSmart', () => {
    beforeEach(() => {
      mocks.search.searchSmart.mockResolvedValue({ hasNextPage: false, items: [] });
      mocks.machineLearning.encodeText.mockResolvedValue('[1, 2, 3]');
    });

    it('should raise a BadRequestException if machine learning is disabled', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        machineLearning: { enabled: false },
      });

      await expect(sut.searchSmart(authStub.user1, { query: 'test' })).rejects.toThrowError(
        new BadRequestException('Smart search is not enabled'),
      );
    });

    it('should raise a BadRequestException if smart search is disabled', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        machineLearning: { clip: { enabled: false } },
      });

      await expect(sut.searchSmart(authStub.user1, { query: 'test' })).rejects.toThrowError(
        new BadRequestException('Smart search is not enabled'),
      );
    });

    it('should work', async () => {
      await sut.searchSmart(authStub.user1, { query: 'test' });

      expect(mocks.machineLearning.encodeText).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ modelName: expect.any(String) }),
      );
      expect(mocks.search.searchSmart).toHaveBeenCalledWith(
        { page: 1, size: 100 },
        { query: 'test', embedding: '[1, 2, 3]', userIds: [authStub.user1.user.id] },
      );
    });

    it('should consider page and size parameters', async () => {
      await sut.searchSmart(authStub.user1, { query: 'test', page: 2, size: 50 });

      expect(mocks.machineLearning.encodeText).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ modelName: expect.any(String) }),
      );
      expect(mocks.search.searchSmart).toHaveBeenCalledWith(
        { page: 2, size: 50 },
        expect.objectContaining({ query: 'test', embedding: '[1, 2, 3]', userIds: [authStub.user1.user.id] }),
      );
    });

    it('should use clip model specified in config', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        machineLearning: { clip: { modelName: 'ViT-B-16-SigLIP__webli' } },
      });

      await sut.searchSmart(authStub.user1, { query: 'test' });

      expect(mocks.machineLearning.encodeText).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ modelName: 'ViT-B-16-SigLIP__webli' }),
      );
    });

    it('should use language specified in request', async () => {
      await sut.searchSmart(authStub.user1, { query: 'test', language: 'de' });

      expect(mocks.machineLearning.encodeText).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ language: 'de' }),
      );
    });
  });
});
