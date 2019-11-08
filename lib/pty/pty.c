#include <stdio.h>
#include <util.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <string.h>

#define MAX_LENGTH_OF_DECIMAL_INT 11
#define NULL_TERM_LENGTH 1
#define MNEU_LENGTH 1
#define COLON_LENGTH 1

#define CMD_EXIT_CODE 'X'
#define CMD_EXIT_SIGNAL 'S'
#define CMD_STDOUT 'O'
#define CMD_STDERR 'E'
#define CMD_STDIN 'I'
#define CMD_COMMS 'C'
#define CMD_SLAVE_PID 'P'
#define CMD_MASTER_PID 'M'
#define CMD_DEBUG 'D'

extern char **environ;

static int slave_pid = -1;

void write_all(const int fd, const char *const buffer, const int length)
{
    int bytes_written = 0;
    int remaining = length;
    const char *write_ptr = buffer;
    while (remaining > 0)
    {
        bytes_written = write(fd, write_ptr, remaining);
        remaining -= bytes_written;
        write_ptr += bytes_written;
    }
}

#define DEBUG 1

void write_command(const char mneumonic, const int arg, const char *const str, const int str_length)
{
#if DEBUG
    int size;
    char buffer[128];
    switch (mneumonic)
    {
    case CMD_SLAVE_PID:
        write_all(STDOUT_FILENO, "Slave PID:", 10);
        break;
    case CMD_MASTER_PID:
        write_all(STDOUT_FILENO, "Master PID:", 11);
        break;
    case CMD_COMMS:
        write_all(STDOUT_FILENO, "Comms:", 6);
        break;
    case CMD_STDOUT:
        write_all(STDOUT_FILENO, "Output:", 7);
        break;
    case CMD_STDERR:
        write_all(STDOUT_FILENO, "ErrOut:", 7);
        break;
    case CMD_STDIN:
        write_all(STDOUT_FILENO, "Input:", 6);
        break;
    case CMD_EXIT_SIGNAL:
        write_all(STDOUT_FILENO, "Signal:", 7);
        break;
    case CMD_EXIT_CODE:
        write_all(STDOUT_FILENO, "Exit:", 5);
        break;
    case CMD_DEBUG:
        write_all(STDOUT_FILENO, "XXX:", 4);
        break;
    default:
        size = sprintf(buffer, "%c:", mneumonic);
        write_all(STDOUT_FILENO, buffer, size);
        break;
    }
    size = sprintf(buffer, "[%d]:", arg);
    write_all(STDOUT_FILENO, buffer, size);
    if (str != NULL)
    {
        write_all(STDOUT_FILENO, str, str_length);
    }
    putc('\n', stdout);
#else
    int size;
    char buffer[MNEU_LENGTH + MAX_LENGTH_OF_DECIMAL_INT + COLON_LENGTH + NULL_TERM_LENGTH];
    size = sprintf(buffer, "%c%d:", mneumonic, arg);
    write_all(STDOUT_FILENO, buffer, size);
    if (str != NULL)
    {
        write_all(STDOUT_FILENO, str, str_length);
    }
#endif
}

void write_command_str(const char mneumonic, const int arg, const char *const str)
{
    write_command(mneumonic, arg, str, strlen(str));
}

#if DEBUG
void debug(const char *const message, const int arg)
{
    write_command_str(CMD_DEBUG, arg, message);
}
#else
#define debug(m, a) ((void)0);
#endif

#define write_short_command(mneumonic, arg) write_command((mneumonic), (arg), NULL, 0)

void child_exit(const int stat)
{
    if (WIFEXITED(stat))
    {
        write_short_command(CMD_EXIT_CODE, WEXITSTATUS(stat));
        exit(0);
    }
    else if (WIFSIGNALED(stat))
    {
        write_short_command(CMD_EXIT_SIGNAL, WTERMSIG(stat));
        exit(0);
    }
}

/**
 * Handler for various termination signals. If the slave_pid is
 */
void handle_term(const int sig)
{
    if (slave_pid > 0)
    {
        int stat = 0;
        debug("Signal received", sig);
        kill(slave_pid, sig);
        debug("Killed slave PID", slave_pid);
        waitpid(slave_pid, &stat, 0);
        debug("Child exited", stat);
        child_exit(stat);
    }
    exit(0);
}

#define MS_TO_US(ms) ((ms)*1000)

int master_comms(const int comms_fd, const int master_in, const int slave_write, const int slave_out, const int slave_err)
{
    static char readbuffer[4096];
    fd_set set;
    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = MS_TO_US(100);

    const int fds[4] = {comms_fd, master_in, slave_out, slave_err};
    const char labels[4] = {CMD_COMMS, CMD_STDIN, CMD_STDOUT, CMD_STDERR};
    int i;
    int fd;
    int select_res;
    int slave_pid_stat;
    int bytes_read;
    while (1)
    {
        // Check if the slave process is done
        if (waitpid(slave_pid, &slave_pid_stat, WNOHANG) > 0)
        {
            child_exit(slave_pid_stat);
        }

        // Check which of these filedescriptors has something to read.
        FD_ZERO(&set);
        FD_SET(comms_fd, &set);
        FD_SET(master_in, &set);
        FD_SET(slave_out, &set);
        FD_SET(slave_err, &set);
        select_res = select(FD_SETSIZE, &set, NULL, NULL, &timeout);
        if (select_res < 0)
        {
            perror("Error running select");
            return -1;
        }
        else if (select_res > 0)
        {
            // Iterate over the input filedescriptors, and read from whichever ones have something ready.
            for (i = 0; i < 4; i++)
            {
                fd = fds[i];
                if (FD_ISSET(fd, &set))
                {
                    debug("Data available", i);
                    bytes_read = read(fd, readbuffer, sizeof(readbuffer) / sizeof(readbuffer[0]));
                    if (bytes_read > 0)
                    {
                        write_command(labels[i], bytes_read, readbuffer, bytes_read);
                        if (fd == master_in)
                        {
                            write_all(slave_write, readbuffer, bytes_read);
                        }
                    }
                    else if (fd == master_in)
                    {
                        const char EOI = '\x04';
                        write(slave_write, &EOI, 1);
                    }
                }
            }
        }
    }
    fprintf(stderr, "Internal Error: Exited From Never Ending Loop\n");
    return -1;
}

int main(const int argc, char **argv)
{

    signal(SIGINT, handle_term);
    signal(SIGTERM, handle_term);
    signal(SIGQUIT, handle_term);
    signal(SIGHUP, handle_term);

    int master = -1;
    int slave = -1;
    int ret;
    const char *name;
    struct winsize winp;
    winp.ws_col = 80;
    winp.ws_row = 40;
    winp.ws_xpixel = 0;
    winp.ws_ypixel = 0;
    char *command_args[argc + 1];
    int a;
    for (a = 0; a < argc; a++)
    {
        command_args[a] = argv[a + 1];
    }
    command_args[argc] = NULL;

    // Open the pseudoterminal for the slave process to use as it's terminal.
    if (openpty(&master, &slave, NULL, (struct termios *)NULL, &winp) != 0 || master < 0 || slave < 0)
    {
        perror("Failed to open pty");
        return 1;
    }
    name = ptsname(master);

    // Create a pipe (pair of connected FDs) that we'll use for communicating error stream between slave and master;
    int stderr_pipe[2] = {-1, -1};
    if (pipe(stderr_pipe) != 0)
    {
        perror("Failed to create STDERR pipe");
        return 1;
    }

    // Create another pipe that we'll use for out of band communications with the slave process.
    int comms_pipe[2] = {-1, -1};
    if (pipe(comms_pipe) != 0)
    {
        perror("Failed to create COMMS pipe");
        return 1;
    }

    // Fork a slave process.
    slave_pid = fork();
    switch (slave_pid)
    {
    case -1:
        perror("fork failed");
        return 1;
    case 0:
        // Slave process

        // Close the master side of the PTY
        close(master);

        // Close the master sides of the pipes.
        close(stderr_pipe[0]);
        close(comms_pipe[0]);
        setsid();

        // Try to take controll of the PTY
        if (ioctl(slave, TIOCSCTTY, (char *)NULL) != 0)
        {
            // Make it so when we write to STDERR, it gets sent through the comms pipe to the mater.
            dup2(comms_pipe[1], STDERR_FILENO);
            // Which lets us now close the comms pipe (because we just use STDERR now).
            close(comms_pipe[1]);
            write_all(STDERR_FILENO, "ERROR:", 6);
            perror("Failed to become controlling terminal");
            close(slave);
            close(stderr_pipe[1]);
            return (-1);
        }
        // Map slave process's stdin to the slave side of the PTY, so when we read from STDIN, we're pulling from the master over the PTY.
        dup2(slave, STDIN_FILENO);

        // Map slave's STDOUT so the PTY as well, so when we write to STDOUT, it will go to the master.
        dup2(slave, STDOUT_FILENO);

        // Write slave's STDERR so when we write to it, it goes to this pipe where the master can read it.
        dup2(stderr_pipe[1], STDERR_FILENO);

        // With everything mapped over, we can close these.
        close(slave);
        close(stderr_pipe[1]);

        // Let master know we're starting.
        write_all(comms_pipe[1], "START\n", 6);

        // Execute the requested command.
        ret = execve(command_args[0], command_args, environ);

        // Let the master know we're done.
        write_all(comms_pipe[1], "END\n", 4);
        close(comms_pipe[1]);
        return ret;
    default:
        // Master process
        write_short_command(CMD_MASTER_PID, getpid());

        // Close the slave side of the PTY (the slave still has it open)
        close(slave);

        // Close the slave side of our pipes.
        close(stderr_pipe[1]);
        close(comms_pipe[1]);

        // Disable buffering on STDIN
        setvbuf(stdin, NULL, _IONBF, 0);

        // Release Control TTY from the PTY
        fcntl(master, F_SETFD, O_RDWR | O_NOCTTY);

        // Output the PID for the child process.
        write_short_command(CMD_SLAVE_PID, slave_pid);

        // Pipe communications between caller and slave.
        ret = master_comms(comms_pipe[0], STDIN_FILENO, master, master, stderr_pipe[0]);

        // All done.
        close(master);
        close(comms_pipe[0]);
        close(stderr_pipe[0]);
        return ret;
    }
    fprintf(stderr, "Internal Error: Unhandled switch case\n");
    return -1;
}
