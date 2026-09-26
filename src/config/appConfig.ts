export interface AppTemplateConfig {
  schemaVersion: number;
  appId: string;
  appName: string;
  defaultDomainId: string;
  features: {
    banks: boolean;
    references: boolean;
    reminders: boolean;
    ads: boolean;
    game: boolean;
    imports: boolean;
  };
}

export const appConfig: AppTemplateConfig = {
  schemaVersion: 1,
  appId: 'com.nexus.customsstudy',
  appName: 'منصة المراجعة',
  defaultDomainId: 'customs_ma',
  features: {
    banks: true,
    references: true,
    reminders: true,
    ads: true,
    game: false,
    imports: true,
  },
};
