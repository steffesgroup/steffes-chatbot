import { SupportedExportFormats } from '@/types/export';
import { PluginKey } from '@/types/plugin';
import {
  IconFileExport,
  IconLayoutDashboard,
  IconMoon,
  IconSettings,
  IconSun,
} from '@tabler/icons-react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { FC } from 'react';
import { Import } from '../Settings/Import';
import { Key } from '../Settings/Key';
import { SidebarButton } from '../Sidebar/SidebarButton';
import { ClearConversations } from './ClearConversations';
import { PluginKeys } from './PluginKeys';

interface Props {
  lightMode: 'light' | 'dark';
  apiKey: string;
  pluginKeys: PluginKey[];
  conversationsCount: number;
  isAdmin?: boolean;
  onToggleLightMode: (mode: 'light' | 'dark') => void;
  onApiKeyChange: (apiKey: string) => void;
  onClearConversations: () => void;
  onExportConversations: () => void;
  onImportConversations: (data: SupportedExportFormats) => void;
  onPluginKeyChange: (pluginKey: PluginKey) => void;
  onClearPluginKey: (pluginKey: PluginKey) => void;
}

export const ChatbarSettings: FC<Props> = ({
  lightMode,
  apiKey,
  pluginKeys,
  conversationsCount,
  isAdmin,
  onToggleLightMode,
  onApiKeyChange,
  onClearConversations,
  onExportConversations,
  onImportConversations,
  onPluginKeyChange,
  onClearPluginKey,
}) => {
  const { t } = useTranslation('sidebar');
  const router = useRouter();

  return (
    <div className="flex flex-col items-center space-y-1 border-t border-white/20 pt-1 text-sm">
      {isAdmin && (
        <SidebarButton
          text="Admin Dashboard"
          icon={<IconLayoutDashboard size={18} />}
          onClick={() => router.push('/dashboard')}
        />
      )}

      {conversationsCount > 0 ? (
        <ClearConversations onClearConversations={onClearConversations} />
      ) : null}

      <SidebarButton
        text={lightMode === 'light' ? t('Dark mode') : t('Light mode')}
        icon={
          lightMode === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />
        }
        onClick={() =>
          onToggleLightMode(lightMode === 'light' ? 'dark' : 'light')
        }
      />
      <details className="w-full" style={{ listStyle: 'none' }}>
        <summary className="flex w-full cursor-pointer select-none items-center gap-3 rounded-md px-3 py-3 text-[14px] leading-3 text-white transition-colors duration-200 hover:bg-gray-500/10">
          <IconSettings size={18} /> Advanced
        </summary>
        <div className="ml-8">
          <Import onImport={onImportConversations} />

          <SidebarButton
            text={t('Export data')}
            icon={<IconFileExport size={18} />}
            onClick={() => onExportConversations()}
          />
        </div>
      </details>

      {/* Don't want to confuse non-tech-savvy users so hiding. */}
      {/* <Key apiKey={apiKey} onApiKeyChange={onApiKeyChange} />

      <PluginKeys
        pluginKeys={pluginKeys}
        onPluginKeyChange={onPluginKeyChange}
        onClearPluginKey={onClearPluginKey}
      /> */}
    </div>
  );
};
