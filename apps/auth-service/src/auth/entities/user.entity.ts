export class UserEntity {
  id: string;
  phone: string;
  name: string | null;
  preferredLanguage: 'fr' | 'ar' | 'darija';
  createdAt: Date;
}