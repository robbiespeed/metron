const UserSettings = () => {
  return (
    <User>
      <UpdateName />
      <Deactivate />
    </User>
  );
};

/**
 * User Settings Page Data Graph
 *
 * - User(Id):
 *  - username
 *  - email
 *  - actions:
 *    - update email
 *    - update username
 *    - update password
 *    - deactivate account
 *
 * Feed Data Graph
 * - Post[]:
 *  - authorId
 *  - User(authorId):
 *    - username
 *    - actions:
 *      - follow
 *      - mute
 *  - date
 *  - likeCount
 *  - text
 *  - actions:
 *    - like
 */

class PublicUser {
  id;
  username;
  bio;
  static actions = {
    mute() {},
    unmute() {},
  };
}

class FollowerCount {
  id;
  count;
  static actions = {
    follow() {},
    unfollow() {},
  };
}

class LikeCount {
  id;
  count;
  static actions = {
    like() {},
    unlike() {},
  };
}

class PrivateUser {
  id;
  email;
  static actions = {
    updateUserName() {},
    updateBio() {},
    updateEmail() {},
    updatePassword() {},
    deactivate() {},
  };
  static dependencies = [PublicUser];
}

// user has type of entity with components of PrivateUser and PublicUser
const UserSettingsView = (user) => {
  const publicUser = user.get(PublicUser);
  const privateUser = user.get(PrivateUser);
  const username = publicUser.username;
  const bio = publicUser.bio;
  let editableUsername = username;
  let editableBio = bio;
  let isSubmitting = false;

  const onPublicUpdate = async () => {
    isSubmitting = true;
    const promises = [];
    if (username !== editableUsername) {
      promises.push(privateUser.actions.updateUsername(editableUsername));
    }
    if (bio !== editableBio) {
      promises.push(privateUser.actions.updateBio(editableBio));
    }
    await Promise.all(promises);
    isSubmitting = false;
  };

  return (
    <div>
      <Form onSubmit={onPublicUpdate}>
        <input
          type="text"
          value={editableUsername}
          onChange={(e) => (editableUsername = e.target.value)}
        />
        <input
          type="text"
          value={editableBio}
          onChange={(e) => (editableBio = e.target.value)}
        />
        <Show when={username !== editableUsername || bio !== editableBio}>
          <button type="submit" disabled={isSubmitting}>
            Submit
          </button>
        </Show>
      </Form>
      <button>Change Password</button>
      <button>Deactivate Account</button>
    </div>
  );
};
