import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { InternalParcelsController } from '../src/modules/parcels/internal-parcels.controller';
import { ParcelsService } from '../src/modules/parcels/parcels.service';

describe('InternalParcelsController', () => {
  let controller: InternalParcelsController;
  let parcelsService: jest.Mocked<ParcelsService>;

  beforeEach(async () => {
    const mockParcelsService = {
      findParcelOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalParcelsController],
      providers: [
        { provide: ParcelsService, useValue: mockParcelsService },
      ],
    }).compile();

    controller = module.get<InternalParcelsController>(InternalParcelsController);
    parcelsService = module.get(ParcelsService);

    jest.clearAllMocks();
  });

  it('✅ Devrait renvoyer la résolution parcelle → propriétaire', async () => {
    const owner = { parcelId: 'parcel-1', farmId: 'farm-1', ownerId: 'user-1' };
    parcelsService.findParcelOwner.mockResolvedValueOnce(owner);

    await expect(controller.findOwner('parcel-1')).resolves.toEqual(owner);
    expect(parcelsService.findParcelOwner).toHaveBeenCalledWith('parcel-1');
  });

  it('❌ Devrait propager le 404 pour une parcelle inconnue', async () => {
    parcelsService.findParcelOwner.mockImplementationOnce(() => {
      throw new HttpException('Parcelle introuvable.', HttpStatus.NOT_FOUND);
    });

    await expect(controller.findOwner('inconnu')).rejects.toThrow(HttpException);
  });
});
