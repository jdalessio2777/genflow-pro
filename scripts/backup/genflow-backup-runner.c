/* Launchd entry point for GenFlow backups. Exists so Full Disk Access can be
   granted to this one program rather than to all of /bin/bash. Do not rebuild
   casually: macOS ties the grant to this exact binary. Takes no arguments. */
#include <unistd.h>
#include <stdio.h>
int main(void) {
    char *const argv[] = {"/bin/bash",
        "/Users/jwoke/Library/Application Support/GenFlowBackup/genflow-backup.sh", NULL};
    execv("/bin/bash", argv);
    perror("genflow-backup-runner: exec failed");
    return 127;
}
