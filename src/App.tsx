import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AppProvider, ToolbarProvider, useAppContext } from './AppContext';
import { routePaths } from './routes';
import AppLayout from './components/AppLayout';
import InstallDialog from './components/InstallDialog';
import HostConflictDialog from './components/HostConflictDialog';
import ImportSourceDialog from './components/ImportSourceDialog';
import BatchInstallDialog from './components/BatchInstallDialog';
import DiscoverPage from './pages/DiscoverPage';
import DiscoverDetailPage from './pages/DiscoverDetailPage';
import LocalPage from './pages/LocalPage';
import FavoritesPage from './pages/FavoritesPage';
import AgentsPage from './pages/AgentsPage';
import SettingsPage from './pages/SettingsPage';

const AppDialogs = () => {
  const {
    dialogOpen,
    dialogSkill,
    agents,
    dialogAgents,
    installConflict,
    installSubmitting,
    hostingConflictSkill,
    apiKey,
    importStatus,
    importDialogOpen,
    importDialogKind,
    importDialogValue,
    importCandidates,
    selectedImportCandidateIds,
    batchInstallOpen,
    batchInstallSkills,
    batchInstallAgents,
    batchInstallSubmitting,
    setDialogAgents,
    setBatchInstallAgents,
    setInstallConflict,
    setDialogOpen,
    confirmInstall,
    closeImportDialog,
    setImportDialogValue,
    toggleImportCandidate,
    setAllImportCandidatesSelected,
    confirmImportSkill,
    closeBatchInstallDialog,
    confirmBatchInstall,
    resolveHostingConflict,
    cancelHostingConflict,
    openSkillLocation,
  } = useAppContext();

  return (
    <>
      <InstallDialog
        open={dialogOpen}
        skill={dialogSkill}
        agents={agents}
        selectedAgents={dialogAgents}
        onToggleAgent={(id) => {
          setDialogAgents((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        conflict={installConflict}
        onOverwrite={() => confirmInstall(true)}
        onKeep={() => {
          setInstallConflict(false);
          setDialogOpen(false);
        }}
        onOpenSkillPath={openSkillLocation}
        onClose={() => setDialogOpen(false)}
        onConfirm={() => confirmInstall(false)}
        submitting={installSubmitting}
      />
      <ImportSourceDialog
        open={importDialogOpen}
        kind={importDialogKind}
        status={importStatus}
        value={importDialogValue}
        candidates={importCandidates}
        selectedCandidateIds={selectedImportCandidateIds}
        apiKeyRequired={importDialogKind === 'skillpkg' && !apiKey.trim()}
        onChangeValue={setImportDialogValue}
        onToggleCandidate={toggleImportCandidate}
        onSelectAllCandidates={setAllImportCandidatesSelected}
        onConfirm={confirmImportSkill}
        onClose={closeImportDialog}
      />
      <BatchInstallDialog
        open={batchInstallOpen}
        skills={batchInstallSkills}
        agents={agents}
        selectedAgents={batchInstallAgents}
        submitting={batchInstallSubmitting}
        onToggleAgent={(id) => {
          setBatchInstallAgents((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        onClose={closeBatchInstallDialog}
        onConfirm={confirmBatchInstall}
      />
      <HostConflictDialog
        skill={hostingConflictSkill}
        onUseManaged={() => resolveHostingConflict('use-managed')}
        onOverwrite={() => resolveHostingConflict('overwrite')}
        onClose={cancelHostingConflict}
      />
    </>
  );
};

const AppRoutes = () => (
  <>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={routePaths.discover} element={<DiscoverPage />} />
        <Route path={routePaths.discoverDetail} element={<DiscoverDetailPage />} />
        <Route path={routePaths.local} element={<LocalPage />} />
        <Route path={routePaths.favorites} element={<FavoritesPage />} />
        <Route path={routePaths.agents} element={<AgentsPage />} />
        <Route path={routePaths.settings} element={<SettingsPage />} />
        <Route path="/" element={<Navigate to={routePaths.discover} replace />} />
      </Route>
    </Routes>
    <AppDialogs />
  </>
);

const App = () => (
  <AppProvider>
    <ToolbarProvider>
      <AppRoutes />
    </ToolbarProvider>
  </AppProvider>
);

export default App;
