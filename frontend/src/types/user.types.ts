import type {AuthUser} from './auth.types';


export interface UpdateProfilePayload {
    name?:string;
    preferredLanguage?: AuthUser['preferredLanguage'];
}