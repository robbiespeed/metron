FROM registry.fedoraproject.org/fedora-toolbox:37

# Update base software
RUN dnf upgrade -y

# Setup user
ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Install node
RUN dnf install -y nodejs

# Clean package manager
RUN dnf clean all -y

# Set the default user. Omit if you want to keep the default as root.
USER $USERNAME

# Install pnpm
RUN curl -fsSL https://get.pnpm.io/install.sh | sh -
