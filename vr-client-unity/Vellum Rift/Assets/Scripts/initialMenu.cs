using UnityEngine; //gives script access to Unity features

public class initialMenu : MonoBehaviour
{
    [SerializeField] private GameObject menuRoot; //if mainmenu root is active, the menu shows if it is inactive, the menu disappears
    [SerializeField] private playerController playerController; //lets menu talk to the player movement switch

    private void Start()
    {
        ShowMenu();
    }

    public void PlayGame()
    {
        HideMenu();
    }
    //if menu exists, turn it on and if the player controller exists turn movement off

    private void ShowMenu()
    {
        if (menuRoot != null)
        {
            menuRoot.SetActive(true);
        }

        if (playerController != null)
        {
            playerController.SetMovementEnabled(false);
        }
    }
    //player can't move while menu is showing

    private void HideMenu()
    {
        if (menuRoot != null)
        {
            menuRoot.SetActive(false);
        }

        if (playerController != null)
        {
            playerController.SetMovementEnabled(true);
        }
    }
}